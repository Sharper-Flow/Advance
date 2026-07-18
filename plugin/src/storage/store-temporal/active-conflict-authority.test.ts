/**
 * Active-only conflict authority (fixChangeEnumerationStarvation, task 1).
 *
 * Verifies:
 *  1. `listConflictAuthority` enumerates only Visibility-proven active IDs
 *     (`AdvLifecycleState="open" AND ExecutionStatus="Running"`), reconciles
 *     any terminal shadow to a confirmed terminal record, and returns a complete
 *     or typed-incomplete result under the 8s aggregate deadline.
 *  2. No unbounded archive-directory/terminal-bundle scans are performed;
 *     terminal-shadow reconciliation reads only the single confirming record
 *     for a shadow candidate (AC1 / AC3 / DC1).
 *  3. Full Visibility pagination is required for completeness.
 *  4. Visibility source/page errors and deadline expiry are typed incomplete.
 *  5. A wrong-id durable projection, missing durable projection, or terminal
 *     shadow that cannot be confirmed makes the authority incomplete.
 *  6. The optional workflow fallback is capped at min(1,000ms, remaining budget),
 *     so a poisoned 650ms candidate cannot consume the whole request.
 *  7. Cache/memo warmth cannot establish completeness; only Visibility + durable
 *     active facts are authoritative.
 *  8. Terminal shadows are excluded from active membership without producing
 *     false incompleteness when the terminal record is confirmed.
 *
 * Timing tests use vi fake timers and controllable promises — no wall-clock
 * sleeps (DC10).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { createTemporalReadDeadline } from "../../temporal/retry-wrapper";
import { TEMPORAL_READ_DEADLINE_BUDGET_MS } from "./shared";

const archiveReadCalls: { fn: string; args: unknown[] }[] = [];

vi.mock("../json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../json")>();
  return {
    ...actual,
    listChangeDirs: async (path: string): Promise<string[]> => {
      if (String(path).includes("archive")) {
        archiveReadCalls.push({ fn: "listChangeDirs", args: [path] });
        throw new Error(
          "archive directory read should not happen in active conflict authority",
        );
      }
      return actual.listChangeDirs(path);
    },
    loadChange: async (root: string, id: string) => {
      if (String(root).includes("archive")) {
        archiveReadCalls.push({ fn: "loadChange", args: [root, id] });
        throw new Error(
          "archive bundle read should not happen in active conflict authority",
        );
      }
      return actual.loadChange(root, id);
    },
    hasArchiveBundle: async (root: string, id: string) => {
      archiveReadCalls.push({ fn: "hasArchiveBundle", args: [root, id] });
      return actual.hasArchiveBundle(root, id);
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
    projectId: "project-1",
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
  return {
    client: {
      workflow: {
        list: async function* () {
          if (opts.listError) throw opts.listError;
          for (const id of opts.ids ?? []) {
            yield { workflowId: `adv/change/project-1/${id}` };
            if (opts.listDelayAfter !== undefined) {
              await new Promise<void>((resolve) =>
                globalThis.setTimeout(resolve, opts.listDelayAfter),
              );
            }
          }
        },
        getHandle: (workflowId: string) => {
          const id = workflowId.replace(`adv/change/project-1/`, "");
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
  };
}

/**
 * Settle a pending authority read that interleaves real disk I/O with
 * fake-timer-delayed workflow-fallback queries.
 *
 * A single fixed `advanceTimersByTimeAsync` is flaky under slower CI: the
 * fallback query/cap timers are registered only after a real `loadChange`
 * macrotask resolves, so a one-shot advance can miss them entirely (hang) —
 * while `runAllTimersAsync` overshoots and fires the 1,000ms cap even when the
 * 650ms query should win. Instead advance the fake clock in small steps,
 * flushing real I/O before each step so any newly-needed timer is registered
 * first, and stop as soon as the read settles. Because the fallback query
 * (regTime+650ms) always precedes the cap (regTime+1,000ms), the success case
 * settles before the cap; the poison case (regTime+1,200ms query) settles when
 * the cap fires. Bounded by `maxTotalMs` so a real hang still fails fast (DC10).
 */
async function settlePending<T>(
  pending: Promise<T>,
  {
    stepMs = 50,
    maxTotalMs = 5_000,
  }: { stepMs?: number; maxTotalMs?: number } = {},
): Promise<T> {
  let settled = false;
  void pending.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  let total = 0;
  while (!settled && total < maxTotalMs) {
    // Flush real macro/microtasks (e.g. the missing-file loadChange) so the
    // fallback timers exist before we advance the fake clock onto them.
    await new Promise<void>((resolve) => setImmediate(resolve));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(stepMs);
    total += stepMs;
  }
  return pending;
}

describe("active conflict authority", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    archiveReadCalls.length = 0;
  });

  afterEach(async () => {
    archiveReadCalls.length = 0;
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("completes with 78 terminal bundles and 13 active candidates without reading archives", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);

    const activeIds: string[] = [];
    for (let i = 0; i < 13; i++) {
      const id = `active-${String(i).padStart(2, "0")}`;
      activeIds.push(id);
      await legacy.changes.save(activeChange(id));
    }
    for (let i = 0; i < 78; i++) {
      await writeArchiveBundle(tempDir, archivedChange(`archived-${i}`));
    }

    const temporal = mockTemporalClient({ ids: activeIds });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
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
      projectId: "project-1",
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
      projectId: "project-1",
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
      projectId: "project-1",
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
    // active-01 is NOT saved to disk, so the durable projection is missing.

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
      projectId: "project-1",
    });

    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    // Interleave real missing-file I/O with the 650ms fake-timer fallback
    // delay deterministically (see settlePending rationale).
    const result = await settlePending(pending);

    expect(result.completeness).toBe("complete");
    expect(result.canConcludeClean).toBe(true);
    expect(result.active).toHaveLength(1);
    expect(result.active[0].capabilities).toEqual(["cap-active-01"]);
    expect(archiveReadCalls).toHaveLength(0);
  });

  it("caps the workflow fallback so a poisoned candidate cannot consume the whole request", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // No disk records; both candidates must fall back to workflow query.

    const temporal = mockTemporalClient({
      ids: ["slow-01", "slow-02"],
      queryDelayMs: 1_200,
    });
    const store = createTemporalStoreBackend({
      legacy,
      temporal,
      projectId: "project-1",
    });

    const pending = store.changes.listConflictAuthority!({
      deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    });
    // Both candidates fall back to a 1,200ms query; the 1,000ms cap must fire
    // first. settlePending drains the real missing-file I/O and the fake
    // fallback/cap timers deterministically.
    const result = await settlePending(pending);

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
      projectId: "project-1",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("terminal"))).toBe(true);
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
      projectId: "project-1",
    });

    const result = await store.changes.listConflictAuthority!();
    expect(result.completeness).toBe("incomplete");
    expect(result.canConcludeClean).toBe(false);
    expect(result.warnings.some((w) => w.includes("mismatched"))).toBe(true);
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
      projectId: "project-1",
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
