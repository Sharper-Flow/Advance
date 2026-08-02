/**
 * Active-only conflict authority (fixChangeEnumerationStarvation, task 1).
 *
 * Verifies:
 *  1. `listConflictAuthority` enumerates only Visibility-proven active IDs
 *     (`AdvLifecycleState="open" AND ExecutionStatus="Running"`), reconciles
 *     any terminal shadow through the active workflow authority, and returns a complete
 *     or typed-incomplete result under the 8s aggregate deadline.
 *  2. No archive-directory or terminal-bundle reads are performed by active
 *     authority, including terminal-shadow reconciliation (AC1 / AC3 / DC1).
 *  3. Full Visibility pagination is required for completeness.
 *  4. Visibility source/page errors and deadline expiry are typed incomplete.
 *  5. A wrong-id or missing durable projection makes the authority incomplete.
 *  6. The optional workflow fallback is capped at min(1,000ms, remaining budget),
 *     so a poisoned 650ms candidate cannot consume the whole request.
 *  7. Cache/memo warmth cannot establish completeness; only Visibility + durable
 *     active facts are authoritative.
 *  8. Terminal shadows are excluded from active membership without producing
 *     false incompleteness when active workflow authority confirms terminal state.
 *
 * Timing tests use vi fake timers and controllable promises — no wall-clock
 * sleeps (DC10).
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createMockOwnerFromClient } from "../../temporal/__tests__/mock-owner";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { createTemporalReadDeadline } from "../../temporal/retry-wrapper";
import { TEMPORAL_READ_DEADLINE_BUDGET_MS } from "./shared";
const PROJECT_ID = "0000ec0100000000000000000000000000000000";

const archiveReadCalls: { fn: string; args: unknown[] }[] = [];

/**
 * Change IDs whose active durable projection must resolve as `not_found`
 * deterministically (no real `fs.access`), so the workflow-fallback path is
 * driven purely by fake timers with no real-I/O timing nondeterminism.
 */
const forceNotFound = new Set<string>();

vi.mock("../change-projection-reader", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../change-projection-reader")>();
  return {
    ...actual,
    listChangeDirs: async (path: string): Promise<string[]> => {
      if (String(path).includes("archive") && existsSync(path)) {
        archiveReadCalls.push({ fn: "listChangeDirs", args: [path] });
        throw new Error(
          "archive directory read should not happen in active conflict authority",
        );
      }
      return actual.listChangeDirs(path);
    },
    loadChange: async (root: string, id: string) => {
      if (String(root).includes("archive") && existsSync(root)) {
        archiveReadCalls.push({ fn: "loadChange", args: [root, id] });
        throw new Error(
          "archive bundle read should not happen in active conflict authority",
        );
      }
      if (forceNotFound.has(id)) {
        return {
          success: false as const,
          error: `forced not_found: ${id}`,
          type: "not_found" as const,
        };
      }
      return actual.loadChange(root, id);
    },
  };
});

function activeChange(
  id: string,
  capabilities: string[] = ["cap-" + id],
): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "draft",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: Object.fromEntries(capabilities.map((c) => [c, []])),
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

function archivedChange(id: string): Change {
  return {
    ...activeChange(id, []),
    title: `Archived ${id}`,
    status: "archived",
  };
}

function workflowStateFor(change: Change) {
  return {
    id: change.id,
    changeId: change.id,
    title: change.title,
    status: change.status,
    createdAt: change.created_at,
    initializedAt: change.created_at,
    projectId: "0000ec0100000000000000000000000000000000",
    tasks: [],
    deltas: change.deltas,
    wisdom: [],
    gates: change.gates ?? createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    documents: {},
    reflections: [],
    worktrees: {},
    conformance: { lockedSpecs: [], overrides: [] },
    worktree_auto_managed: false,
  };
}

async function writeArchiveBundle(tempDir: string, change: Change) {
  const archiveDir = join(tempDir, ".adv", "archive", change.id);
  await mkdir(archiveDir, { recursive: true });
  await writeFile(
    join(archiveDir, "change.json"),
    JSON.stringify(change, null, 2),
  );
}

interface MockTemporalOptions {
  ids?: string[];
  queryDelayMs?: number | ((id: string) => number);
  queryError?: Error;
  listError?: Error;
  listDelayAfter?: number;
  queryStates?: Record<string, unknown>;
}

function mockTemporalClient(opts: MockTemporalOptions = {}) {
  return createMockOwnerFromClient({
    client: {
      workflow: {
        list: async function* () {
          if (opts.listError) throw opts.listError;
          for (const id of opts.ids ?? []) {
            yield { workflowId: `adv/change/${PROJECT_ID}/${id}` };
            if (opts.listDelayAfter !== undefined) {
              await new Promise<void>((resolve) =>
                globalThis.setTimeout(resolve, opts.listDelayAfter),
              );
            }
          }
        },
        getHandle: (workflowId: string) => {
          const id = workflowId.replace(`adv/change/${PROJECT_ID}/`, "");
          return {
            query: async () => {
              if (opts.queryError) throw opts.queryError;
              const delay =
                typeof opts.queryDelayMs === "function"
                  ? opts.queryDelayMs(id)
                  : opts.queryDelayMs;
              if (delay) {
                await new Promise<void>((resolve) =>
                  globalThis.setTimeout(resolve, delay),
                );
              }
              return (
                opts.queryStates?.[id] ?? workflowStateFor(activeChange(id))
              );
            },
          };
        },
        start: async () => {
          throw new Error("start should not be called");
        },
      },
    },
  });
}

/**
 * Settle a pending authority read whose workflow fallback is driven by fake
 * timers. The durable projection resolves as `not_found` via `forceNotFound`
 * (no real `fs.access`), so all fallback timers register deterministically at
 * fake-time 0 after a short microtask flush. A single bounded advance then
 * fires exactly the intended timers: 800ms fires a 650ms success query but not
 * the 1,000ms cap; 1,100ms fires the 1,000ms cap for a 1,200ms poison query.
 * No wall-clock sleeps and no real-I/O timing dependency (DC10).
 */
async function settleFallback<T>(
  pending: Promise<T>,
  advanceMs: number,
): Promise<T> {
  // Flush the microtask chain (visibility enumeration + not_found load) so the
  // fallback timers are registered before advancing the fake clock.
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(advanceMs);
  return pending;
}

describe("active conflict authority", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    archiveReadCalls.length = 0;
    forceNotFound.clear();
  });

  afterEach(async () => {
    archiveReadCalls.length = 0;
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("completes with 250 terminal bundles and 13 active candidates without reading archives", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const activeIds: string[] = [];
    for (let i = 0; i < 13; i++) {
      const id = `active-${String(i).padStart(2, "0")}`;
      activeIds.push(id);
      await legacy.changes.save(activeChange(id));
    }
    for (let i = 0; i < 250; i++) {
      await writeArchiveBundle(tempDir, archivedChange(`archived-${i}`));
    }

    const temporal = mockTemporalClient({ ids: activeIds });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const authority = store.changes.listConflictAuthority;
    expect(authority).toBeDefined();
    const result = await authority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });

    expect(result.completeness).toBe("complete");
    expect(result.canConcludeClean).toBe(true);
    expect(result.active).toHaveLength(13);
    expect(result.candidateCount).toBe(13);
    expect(result.omittedCount).toBe(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.active.map((a) => a.id).sort()).toEqual(
      [...activeIds].sort(),
    );
    expect(
      result.active.every((a) => a.capabilities.includes("cap-" + a.id)),
    ).toBe(true);
    expect(archiveReadCalls).toHaveLength(0);
  });

  it("paginates Visibility to exhaustion and reports full candidateCount", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const activeIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const id = `active-${String(i).padStart(2, "0")}`;
      activeIds.push(id);
      await legacy.changes.save(activeChange(id));
    }

    const temporal = mockTemporalClient({ ids: activeIds });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.candidateCount).toBe(50);
    expect(result.completeness).toBe("complete");
  });

  it("returns typed incomplete when Visibility fails", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("active-01"));

    const temporal = mockTemporalClient({
      ids: ["active-01"],
      listError: new Error("visibility unavailable"),
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("Visibility"))).toBe(true);
  });

  it("returns typed incomplete when Visibility pagination exceeds the 8s deadline", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("active-01"));

    const temporal = mockTemporalClient({
      ids: ["active-01"],
      listDelayAfter: 100_000,
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    await vi.advanceTimersByTimeAsync(TEMPORAL_READ_DEADLINE_BUDGET_MS + 100);
    const result = await pending;

    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("deadline"))).toBe(true);
  });

  it("uses the optional workflow fallback for a missing durable record", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // active-01 durable projection resolves not_found deterministically, so
    // the workflow fallback path runs with no real-fs timing dependency.
    forceNotFound.add("active-01");

    const temporal = mockTemporalClient({
      ids: ["active-01"],
      queryDelayMs: 650,
      queryStates: {
        "active-01": workflowStateFor(activeChange("active-01")),
      },
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    // Drain the missing-file I/O, then fire the 650ms fallback query (below
    // the 1,000ms cap) so the fallback succeeds deterministically.
    const result = await settleFallback(pending, 800);

    expect(result.completeness).toBe("complete");
    expect(result.canConcludeClean).toBe(true);
    expect(result.active).toHaveLength(1);
    expect(result.active[0].capabilities).toEqual(["cap-active-01"]);
    expect(archiveReadCalls).toHaveLength(0);
  });

  it("caps the workflow fallback so a poisoned candidate cannot consume the whole request", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Both durable projections resolve not_found deterministically, so both
    // candidates fall back to the workflow query with no real-fs timing.
    forceNotFound.add("slow-01");
    forceNotFound.add("slow-02");

    const temporal = mockTemporalClient({
      ids: ["slow-01", "slow-02"],
      queryDelayMs: 1_200,
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    // Both candidates fall back to a 1,200ms query; advancing past the
    // 1,000ms cap (but not the query) proves the cap fires first.
    const result = await settleFallback(pending, 1_100);

    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.omittedCount).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("fallback"))).toBe(true);
  });

  it("returns incomplete when a durable projection has a terminal status", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const change = activeChange("active-01");
    change.status = "archived";
    await legacy.changes.save(change);

    const temporal = mockTemporalClient({ ids: ["active-01"] });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("terminal"))).toBe(true);
  });

  it("excludes an archived terminal shadow without reading archive history", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(archivedChange("archived-shadow"));

    const temporal = mockTemporalClient({
      ids: ["archived-shadow"],
      queryStates: {
        "archived-shadow": workflowStateFor(archivedChange("archived-shadow")),
      },
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();

    expect(result.completeness).toBe("complete");
    expect(result.active).toEqual([]);
    expect(result.shadowCount).toBe(1);
    expect(archiveReadCalls).toHaveLength(0);
  });

  it("returns incomplete when a durable projection has a mismatched id", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Directory name is the Visibility-proven id, but the file content has a
    // different id — this must be detected as an invalid durable projection.
    const changeDir = join(tempDir, ".adv", "changes", "active-01");
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(activeChange("other-id"), null, 2),
    );

    const temporal = mockTemporalClient({ ids: ["active-01"] });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("mismatched"))).toBe(true);
  });

  it("isolates a schema-invalid peer instead of failing the whole authority", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    // Healthy peer that must still be reported as an active fact.
    await legacy.changes.save(activeChange("active-01", ["healthy-cap"]));

    // Corrupt peer: schema-invalid durable projection. One bad record must not
    // make the whole conflict authority unreachable.
    const corruptDir = join(tempDir, ".adv", "changes", "active-02");
    await mkdir(corruptDir, { recursive: true });
    await writeFile(
      join(corruptDir, "change.json"),
      JSON.stringify(
        {
          ...activeChange("active-02", ["corrupt-cap"]),
          status: "not-a-status",
        },
        null,
        2,
      ),
    );

    const temporal = mockTemporalClient({ ids: ["active-01", "active-02"] });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listConflictAuthority!();

    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.active.map((c) => c.id)).toEqual(["active-01"]);
    expect(result.omittedCount).toBe(1);
    expect(
      result.warnings.some(
        (w) => w.includes("active-02") && w.includes("schema"),
      ),
    ).toBe(true);
  });

  it("does not treat cache/memo warmth as authority", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Save an active change on disk so the memo/cache could be warmed later.
    await legacy.changes.save(activeChange("active-01", ["cached-cap"]));

    const temporal = mockTemporalClient({ ids: ["active-01"] });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    // Warm the non-authoritative cache by listing the change.
    await store.changes.list({});

    // Now corrupt the durable record so the authority cannot rely on it.
    const corrupted = activeChange("active-01");
    corrupted.status = "archived";
    await legacy.changes.save(corrupted);

    const result = await store.changes.listConflictAuthority!();
    // The cache may still hold the old active row, but the authority must
    // read the durable record and reject the now-terminal projection.
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
  });
});
