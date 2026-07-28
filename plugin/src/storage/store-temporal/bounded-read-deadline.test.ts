/**
 * Routine change-list reads now route through immutable summary shards.
 *
 * This file verifies that `store.changes.list` and `store.changes.listSummary`
 * are projection-only: they read durable summary pointers, perform no Temporal
 * Visibility/Query/hydration, and return complete results without deadline
 * metadata. Terminal filtering and degraded-index handling are also covered.
 */

import { writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function poisonedTemporal() {
  return {
    temporal: {
      client: {
        workflow: {
          getHandle: () => ({
            query: async () => {
              throw new Error("routine list must not query workflow");
            },
          }),
          list: async () => {
            throw new Error("routine list must not enumerate Visibility");
          },
          start: async () => {
            throw new Error("routine list must not start a workflow");
          },
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

    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "project-1",
    });

    const result = await store.changes.list({});
    expect(result.changes.map((c) => c.id)).toEqual(["activeOne"]);
    expect(result.warnings).toBeUndefined();
    expect(result.hydrationStats?.deadlineExceeded).toBeFalsy();
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

    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "project-1",
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

    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "project-1",
    });

    const page = await store.changes.listSummary!({ limit: 1, offset: 0 });
    expect(page.changes).toHaveLength(1);
    expect(page.hydrationStats?.fromHydration).toBe(0);
    expect(page.warnings).toBeUndefined();
  });

  it("changes.list returns empty results and degraded metadata when summary index is unreadable", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    // Make summariesDir a file so readdir fails with ENOTDIR.
    await writeFile(legacy.paths.summariesDir, "not a directory");
    const store = createTemporalStoreBackend({
      legacy,
      temporal: poisonedTemporal().temporal,
      projectId: "project-1",
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
  });
});
