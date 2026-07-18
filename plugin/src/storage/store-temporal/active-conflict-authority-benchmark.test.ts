/**
 * Deterministic benchmark gate for active-only conflict authority (AC3).
 *
 * Fixture: 50 active changes whose durable projections are missing, forcing the
 * capped workflow fallback. Each fallback is poisoned with a slow query; the
 * cap and concurrency prevent the budget from being consumed. 50 terminal
 * archive bundles are present but must not be read by the authority.
 *
 * Runs 30 cold + 30 warm authority calls at fact-load concurrency 1/2/4/8 under
 * vitest fake timers. The per-query fallback delay is simulated, so the envelope
 * is deterministic and safe for CI. Assertions:
 *   - zero authority omissions in every run
 *   - every authority run completes within the 8s archive validation bound
 *   - nearest-rank p95 across the 60 samples is <= 6.4s
 *
 * Structural deadline/failure coverage remains in
 * `active-conflict-authority.test.ts`; this gate only adds the budget envelope.
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

const ACTIVE_COUNT = 50;
const TERMINAL_COUNT = 50;
const COLD_RUNS = 30;
const WARM_RUNS = 30;
const CONCURRENCY_LEVELS = [1, 2, 4, 8];
const QUERY_DELAY_MS = 115;
const BUDGET_MS = 8_000;
const P95_LIMIT_MS = 6_400;

/**
 * Active IDs whose durable projection resolves as `not_found` deterministically
 * (no real `fs.access`), so the workflow-fallback path is driven purely by fake
 * timers with no real-I/O timing nondeterminism.
 */
const forceNotFound = new Set<string>();

let lastQueryCompleteMs = 0;

vi.mock("../json", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../json")>();
  return {
    ...actual,
    loadChange: async (root: string, id: string) => {
      if (String(root).includes("archive")) {
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
    listChangeDirs: async (path: string): Promise<string[]> => {
      if (String(path).includes("archive")) {
        throw new Error(
          "archive directory read should not happen in active conflict authority",
        );
      }
      return actual.listChangeDirs(path);
    },
  };
});

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "draft",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: { "cap-active": [] },
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

function archivedChange(id: string): Change {
  return {
    ...activeChange(id),
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

function mockTemporalClient(ids: string[]) {
  return {
    client: {
      workflow: {
        list: async function* () {
          for (const id of ids) {
            yield { workflowId: `adv/change/project-1/${id}` };
          }
        },
        getHandle: (workflowId: string) => {
          const id = workflowId.replace(`adv/change/project-1/`, "");
          return {
            query: async () => {
              await new Promise<void>((resolve) =>
                setTimeout(resolve, QUERY_DELAY_MS),
              );
              lastQueryCompleteMs = Math.max(lastQueryCompleteMs, Date.now());
              return workflowStateFor(activeChange(id));
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

interface RunResult {
  durationMs: number;
  omittedCount: number;
  completeness: string;
  canConcludeClean: boolean;
}

/**
 * Settle a pending authority read whose fallback queries are driven by fake
 * timers. The durable projection resolves as `not_found` deterministically, so
 * all fallback timers register at fake-time 0 after a short microtask flush. A
 * single bounded advance then fires exactly the intended timers: QUERY_DELAY_MS
 * per fallback (below the 1,000ms cap) so the fallback succeeds deterministically.
 */
async function settleAuthority<T>(
  pending: Promise<T>,
  advanceMs: number,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  await vi.advanceTimersByTimeAsync(advanceMs);
  return pending;
}

async function runBenchmarkAuthority(
  store: ReturnType<typeof createTemporalStoreBackend>,
  concurrency: number,
): Promise<RunResult> {
  lastQueryCompleteMs = 0;
  const start = Date.now();
  const pending = store.changes.listConflictAuthority!({
    deadline: createTemporalReadDeadline(TEMPORAL_READ_DEADLINE_BUDGET_MS),
    concurrency,
  });
  const result = await settleAuthority(
    pending,
    TEMPORAL_READ_DEADLINE_BUDGET_MS + 100,
  );
  const durationMs = lastQueryCompleteMs - start;
  return {
    durationMs,
    omittedCount: result.omittedCount,
    completeness: result.completeness,
    canConcludeClean: result.canConcludeClean,
  };
}

function nearestRankP95(sortedMs: number[]): number {
  const n = sortedMs.length;
  const rank = Math.ceil(0.95 * n);
  return sortedMs[Math.min(rank, n) - 1];
}

describe("active conflict authority benchmark gate", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    forceNotFound.clear();
    lastQueryCompleteMs = 0;
  });

  afterEach(async () => {
    forceNotFound.clear();
    vi.useRealTimers();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it.each(CONCURRENCY_LEVELS)(
    "concurrency=%i: 50 poisoned active + 50 terminal within envelope",
    async (concurrency) => {
      tempDir = await createTempDir();
      const legacy = await createDiskStore(tempDir);
      const activeIds: string[] = [];
      for (let i = 0; i < ACTIVE_COUNT; i++) {
        const id = `active-${String(i).padStart(2, "0")}`;
        activeIds.push(id);
        await legacy.changes.save(activeChange(id));
        forceNotFound.add(id);
      }
      for (let i = 0; i < TERMINAL_COUNT; i++) {
        await writeArchiveBundle(tempDir, archivedChange(`archived-${i}`));
      }

      const temporal = mockTemporalClient(activeIds);
      const store = createTemporalStoreBackend({
        legacy,
        temporal,
        projectId: "project-1",
      });

      const durations: number[] = [];

      for (let i = 0; i < COLD_RUNS; i++) {
        const coldStore = createTemporalStoreBackend({
          legacy,
          temporal,
          projectId: "project-1",
        });
        const run = await runBenchmarkAuthority(coldStore, concurrency);
        expect(run.completeness).toBe("complete");
        expect(run.canConcludeClean).toBe(true);
        expect(run.omittedCount).toBe(0);
        durations.push(run.durationMs);
      }

      for (let i = 0; i < WARM_RUNS; i++) {
        const run = await runBenchmarkAuthority(store, concurrency);
        expect(run.completeness).toBe("complete");
        expect(run.canConcludeClean).toBe(true);
        expect(run.omittedCount).toBe(0);
        durations.push(run.durationMs);
      }

      expect(durations).toHaveLength(COLD_RUNS + WARM_RUNS);
      expect(Math.max(...durations)).toBeLessThanOrEqual(BUDGET_MS);

      const sorted = [...durations].sort((a, b) => a - b);
      expect(nearestRankP95(sorted)).toBeLessThanOrEqual(P95_LIMIT_MS);
    },
  );
});
