/**
 * Routine change-list reads now route through immutable summary shards.
 *
 * This file verifies that `store.changes.list` and `store.changes.listSummary`
 * are projection-only: they read durable summary pointers, perform no Temporal
 * Visibility/Query/hydration, and return complete results without deadline
 * metadata. Terminal filtering and degraded-index handling are also covered.
 */

import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTempDir, cleanupTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { rebuildSummaryIndex } from "../change-summary-shard";

function archivedChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Archived ${id}`,
    status: "archived",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: Object.fromEntries(
      Object.entries(createDefaultGates()).map(([gate, value]) => [
        gate,
        { ...value, status: "done" as const },
      ]),
    ) as Change["gates"],
    reentry_history: [],
    wisdom: [],
  };
}

function closedChange(id: string): Change {
  return {
    ...archivedChange(id),
    title: `Closed ${id}`,
    status: "closed",
  };
}

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "active",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

/**
 * A Temporal client double whose every surface is poisoned, used to prove that
 * routine reads never touch Temporal.
 *
 * `list` deliberately mirrors the real client's contract rather than being a
 * rejecting async function. `WorkflowClient.list` returns an
 * `AsyncWorkflowListIterable` *synchronously* and is consumed with `for await`
 * (see `listChangeWorkflowIds`). A double shaped as `async () => { throw }`
 * returns a rejected Promise instead, which `for await` cannot iterate: the
 * consumer throws a TypeError that production catches, while the double's own
 * rejected Promise is left with no handler attached and surfaces as an
 * unhandled rejection. That is a defect in the double, not in the code under
 * test. Returning an async iterable whose `next()` rejects reproduces a real
 * failing client exactly, and the rejection is handled by the awaiting
 * consumer.
 *
 * Because production catches this failure and degrades, a thrown error alone
 * cannot prove that a routine read stayed off Temporal. The returned spies
 * exist so tests can assert call counts directly.
 */
function poisonedTemporal() {
  const list = vi.fn(
    (): AsyncIterable<never> => ({
      [Symbol.asyncIterator]: () => ({
        next: () =>
          Promise.reject(
            new Error("routine list must not enumerate Visibility"),
          ),
      }),
    }),
  );
  const query = vi.fn(async () => {
    throw new Error("routine list must not query workflow");
  });
  const start = vi.fn(async () => {
    throw new Error("routine list must not start a workflow");
  });

  return {
    list,
    query,
    start,
    temporal: {
      client: {
        workflow: {
          getHandle: () => ({ query }),
          list,
          start,
        },
      },
    },
  };
}

describe("projection-only change-list reads", () => {
  let tempDir: string | undefined;

  beforeEach(() => {
    tempDir = undefined;
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it("changes.list returns active rows from summary shards without Temporal reads", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.list({});
    expect(result.changes.map((c) => c.id)).toEqual(["activeOne"]);
    expect(result.warnings).toBeUndefined();
    expect(result.hydrationStats?.deadlineExceeded).toBeFalsy();
    // Assert the absence of Temporal access directly. Production catches and
    // degrades on a failing client, so a poisoned surface that merely throws
    // would let a wrong call pass silently.
    expect(poisoned.list).not.toHaveBeenCalled();
    expect(poisoned.query).not.toHaveBeenCalled();
    expect(poisoned.start).not.toHaveBeenCalled();
  });

  it("changes.list includes terminal rows when requested", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await legacy.changes.save(archivedChange("archivedOne"));
    await legacy.changes.save(closedChange("closedOne"));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const archived = await store.changes.list({ includeArchived: true });
    expect(archived.changes.map((c) => c.id).sort()).toEqual([
      "activeOne",
      "archivedOne",
    ]);

    const closed = await store.changes.list({ includeClosed: true });
    expect(closed.changes.map((c) => c.id).sort()).toEqual([
      "activeOne",
      "closedOne",
    ]);

    // Terminal and routine list reads are projection-only (#353): even
    // terminal reads do not enumerate Temporal Visibility. The rows above
    // came from durable summary shards, so no Temporal client surface was
    // touched.
    expect(poisoned.list).not.toHaveBeenCalled();
    expect(poisoned.query).not.toHaveBeenCalled();
    expect(poisoned.start).not.toHaveBeenCalled();
  });

  it("changes.listSummary pages and filters from summary shards without Temporal reads", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await legacy.changes.save(activeChange("activeTwo"));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const page = await store.changes.listSummary!({ limit: 1, offset: 0 });
    expect(page.changes).toHaveLength(1);
    expect(page.hydrationStats?.fromHydration).toBe(0);
    expect(page.warnings).toBeUndefined();
    expect(poisoned.list).not.toHaveBeenCalled();
    expect(poisoned.query).not.toHaveBeenCalled();
    expect(poisoned.start).not.toHaveBeenCalled();
  });

  it("changes.listSummary includes archived rows when requested", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await legacy.changes.save(archivedChange("archivedOne"));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const archived = await store.changes.listSummary!({
      includeArchived: true,
    });
    expect(archived.changes.map((c) => c.id).sort()).toEqual([
      "activeOne",
      "archivedOne",
    ]);
    expect(archived.hydrationStats?.fromHydration).toBe(0);
  });

  it("changes.listSummary includes closed rows when requested", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("activeOne"));
    await legacy.changes.save(closedChange("closedOne"));
    await rebuildSummaryIndex({
      changesDir: legacy.paths.changes,
      summariesDir: legacy.paths.summariesDir,
    });

    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const closed = await store.changes.listSummary!({ includeClosed: true });
    expect(closed.changes.map((c) => c.id).sort()).toEqual([
      "activeOne",
      "closedOne",
    ]);
    expect(closed.hydrationStats?.fromHydration).toBe(0);
  });

  it("changes.listSummary returns empty results and degraded metadata when summary index is unreadable", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await writeFile(legacy.paths.summariesDir, "not a directory");
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.listSummary!({});
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "active_disk",
        }),
      ]),
    );
  });

  it("changes.list returns empty results and degraded metadata when summary index is unreadable", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Make summariesDir a file so readdir fails with ENOTDIR.
    await writeFile(legacy.paths.summariesDir, "not a directory");
    const poisoned = poisonedTemporal();
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisoned.temporal,
      projectId: "0000ec0100000000000000000000000000000000",
    });

    const result = await store.changes.list({});
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "TERMINAL_SOURCE_DEGRADED",
          source: "active_disk",
        }),
      ]),
    );

    // Projection-only reads (#353) do not fall back to Visibility: when
    // durable sources fail, the summary index degrades to an empty,
    // typed-degraded result rather than reaching for Temporal. The Temporal
    // client surface stays untouched.
    expect(poisoned.list).not.toHaveBeenCalled();
    expect(poisoned.query).not.toHaveBeenCalled();
    expect(poisoned.start).not.toHaveBeenCalled();
  });
});
