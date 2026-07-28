/**
 * Bounded summary status reads (fixChangeListTimeouts, task 3).
 *
 * Verifies:
 *  1. `store.status({ recentLimit })` bounds the recent list AFTER reading
 *     the full durable summary projection, so total counts stay complete
 *     while recency is truncated with typed degradation (AC3 / C2).
 *  2. Complete semantics when every candidate resolves within the bound
 *     (AC2): full counts, no degradation metadata.
 *  3. No workflow queries fire on routine status reads.
 *  4. Bounded recent list is ordered by summary-shard recency.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { rebuildSummaryIndex } from "../change-summary-shard";

function activeChange(
  id: string,
  createdAt = "2026-05-07T00:00:00.000Z",
): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "active",
    created_at: createdAt,
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
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
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    documents: {},
    reflections: [],
    worktrees: {},
    conformance: { lockedSpecs: [], overrides: [] },
    worktree_auto_managed: false,
  };
}

function makeTemporal(
  queried: string[],
  createdAtById?: Map<string, string>,
  visibilityRows: Array<{
    id: string;
    lastSignalAt?: string;
    createdAt?: string;
  }> = [],
) {
  return {
    client: {
      workflow: {
        getHandle: (workflowId: string) => ({
          query: async () => {
            const id = workflowId.split("/").pop() ?? workflowId;
            queried.push(id);
            return workflowStateFor(activeChange(id, createdAtById?.get(id)));
          },
        }),
        list: async function* () {
          for (const row of visibilityRows) {
            yield {
              workflowId: `adv/change/project-1/${row.id}`,
              searchAttributes: {
                ...(row.lastSignalAt
                  ? { AdvLastSignalAt: [row.lastSignalAt] }
                  : {}),
                ...(row.createdAt ? { AdvCreatedAt: [row.createdAt] } : {}),
              },
            };
          }
        },
        start: async () => {
          throw new Error("start should not be called");
        },
      },
    },
  };
}

describe("bounded summary status reads", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = undefined;
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("bounds status hydration to recentLimit with typed degradation (AC3)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const ids = Array.from(
      { length: 12 },
      (_, i) => `change${String(i).padStart(2, "0")}`,
    );
    for (const id of ids) await legacy.changes.save(activeChange(id));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const queried: string[] = [];
    const store = createTemporalStoreBackend({
      legacy,
      temporal: makeTemporal(queried),
      projectId: "project-1",
    });

    const status = await store.status({ recentLimit: 10 });

    // The bound truncates the recent list; the remaining 2 are typed
    // omissions, never silently dropped. Summary-only reads issue no
    // workflow queries.
    expect(queried).toHaveLength(0);
    expect(status.changes.recent.length).toBeLessThanOrEqual(10);
    expect(status.changes.byStatus.draft).toBe(12);
    expect(status.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "SOURCE_BOUND_EXCEEDED",
          omittedCount: 2,
        }),
      ]),
    );
    const boundWarning = status.warnings?.find(
      (w) => w.code === "SOURCE_BOUND_EXCEEDED",
    );
    expect(boundWarning?.omittedIds).toHaveLength(2);
    expect(status.hydrationStats?.boundedOmitted).toBe(2);
    // Summary-only routine reads intentionally do not hydrate full changes.
    expect(status.resolvedChanges?.size).toBe(0);
  });

  it("keeps complete count/recency semantics when candidates resolve within the bound (AC2)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    for (const id of ["alpha", "bravo", "charlie"]) {
      await legacy.changes.save(activeChange(id));
    }
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const queried: string[] = [];
    const store = createTemporalStoreBackend({
      legacy,
      temporal: makeTemporal(queried),
      projectId: "project-1",
    });

    const status = await store.status({ recentLimit: 10 });

    // bl-HiZJbUuy: summary-only reads — 3 candidates resolve from durable
    // shards with zero workflow queries; completeness proven by counts.
    expect(queried).toHaveLength(0);
    expect(status.warnings).toBeUndefined();
    expect(status.hydrationStats?.fromHydration).toBe(0);
    // bl-HiZJbUuy: disk-first returns the canonical normalized status — the
    // disk load path normalizes legacy "active" to "draft" (the schema enum is
    // draft/archived/closed), whereas the old Temporal query mock returned the
    // un-normalized "active".
    expect(status.changes.byStatus.draft).toBe(3);
    expect(status.changes.recent).toHaveLength(3);
    expect(status.resolvedChanges?.size).toBe(0);
  });

  it("hydrates every candidate when no recentLimit is provided (full views)", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const ids = Array.from(
      { length: 12 },
      (_, i) => `change${String(i).padStart(2, "0")}`,
    );
    for (const id of ids) await legacy.changes.save(activeChange(id));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const queried: string[] = [];
    const store = createTemporalStoreBackend({
      legacy,
      temporal: makeTemporal(queried),
      projectId: "project-1",
    });

    const status = await store.status();

    // bl-HiZJbUuy: full view reads all 12 candidates from summary shards
    // (no workflow queries); completeness proven by counts.
    expect(queried).toHaveLength(0);
    expect(status.warnings).toBeUndefined();
    // bl-HiZJbUuy: disk-first returns canonical "draft" (legacy "active"
    // normalizes at the disk load path), not the mock's un-normalized "active".
    expect(status.changes.byStatus.draft).toBe(12);
    expect(status.changes.recent).toHaveLength(12);
    expect(status.resolvedChanges?.size).toBe(0);
  });

  it("orders bounded hydration by recency so the most recent set resolves first", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Three candidates with distinct activity: change00 is oldest, change01
    // newest, change02 in between. Nine more cold disk candidates have no
    // explicit activity timestamp.
    const seeded: Array<[string, string]> = [
      ["change00", "2026-01-01T00:00:00.000Z"],
      ["change01", "2026-06-01T00:00:00.000Z"],
      ["change02", "2026-03-01T00:00:00.000Z"],
    ];
    const cold = Array.from(
      { length: 9 },
      (_, i) => `cold${String(i).padStart(2, "0")}`,
    );
    for (const [id, createdAt] of seeded) {
      await legacy.changes.save(activeChange(id, createdAt));
    }
    for (const id of cold) {
      // Cold changes are older than the seeded set so recency ordering is
      // deterministic.
      await legacy.changes.save(activeChange(id, "2025-01-01T00:00:00.000Z"));
    }
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const queried: string[] = [];
    const store = createTemporalStoreBackend({
      legacy,
      temporal: makeTemporal(queried, new Map(seeded)),
      projectId: "project-1",
    });

    const status = await store.status({ recentLimit: 2 });

    // The two most recent changes resolve; every other candidate is a typed
    // bounded omission. No workflow queries fire.
    expect(queried).toHaveLength(0);
    expect(status.changes.recent.map((r) => r.id).sort()).toEqual([
      "change01",
      "change02",
    ]);
    const boundWarning = status.warnings?.find(
      (w) => w.code === "SOURCE_BOUND_EXCEEDED",
    );
    expect(boundWarning?.omittedCount).toBe(10);
    expect(boundWarning?.omittedIds).not.toContain("change01");
    expect(boundWarning?.omittedIds).not.toContain("change02");
    expect(boundWarning?.omittedIds).toContain("change00");
  });

  it("source-ranks cold health candidates before hydrating only the newest ten", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    const rows = Array.from({ length: 57 }, (_, index) => {
      const id = `ranked${String(index).padStart(2, "0")}`;
      const createdAt = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
      return { id, createdAt, lastSignalAt: createdAt };
    });
    for (const row of rows) {
      await legacy.changes.save(activeChange(row.id, row.createdAt));
    }
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const queried: string[] = [];
    const store = createTemporalStoreBackend({
      legacy,
      temporal: makeTemporal(
        queried,
        new Map(rows.map((row) => [row.id, row.createdAt])),
        [...rows].reverse(),
      ),
      projectId: "project-1",
    });

    const status = await store.status({
      recentLimit: 10,
      sourceRanked: true,
    });

    const expected = rows
      .slice()
      .sort(
        (a, b) =>
          b.lastSignalAt.localeCompare(a.lastSignalAt) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 10)
      .map((row) => row.id);
    // bl-HiZJbUuy: summary shards provide recency ordering (no workflow
    // queries); the newest-10 ranking + 47 bounded omissions still hold.
    expect(queried).toHaveLength(0);
    expect(status.changes.recent.map((row) => row.id)).toEqual(expected);
    expect(status.hydrationStats?.boundedOmitted).toBe(47);
    expect(
      status.warnings?.find(
        (warning) => warning.code === "SOURCE_BOUND_EXCEEDED",
      )?.omittedCount,
    ).toBe(47);
  });
});
