import { describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import type { Epic } from "../../types";
import { createDiskStore } from "../store-disk";
import {
  saveActiveEpicProjection,
  saveRetiredEpicProjection,
} from "../epic-projection";
import { createTemporalStoreBackend } from "./index";

function makeEpic(id: string, createdAt: string): Epic {
  return {
    id,
    title: `Epic ${id}`,
    narrative: "Disk-backed epic",
    entries: [],
    progress: {
      status: "active",
      total_entries: 0,
      completed_entries: 0,
      active_entries: 0,
      next_entry_id: null,
      updated_at: createdAt,
    },
    created_at: createdAt,
    updated_at: createdAt,
    version: 0,
  };
}

function makeStore(legacy: Awaited<ReturnType<typeof createDiskStore>>) {
  return createTemporalStoreBackend({
    legacy,
    temporal: {} as never,
    projectId: "0".repeat(40),
  });
}

describe("disk-backed epic projections", () => {
  it("gets an active epic without a workflow handle", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const epic = makeEpic("active-epic", "2026-01-02T00:00:00.000Z");
      await saveActiveEpicProjection(legacy.paths.activeEpics, epic);

      const result = await makeStore(legacy).epics.get(epic.id);
      expect(result).toMatchObject({
        success: true,
        data: epic,
        source: "active_projection",
      });
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("lists active projections and retired snapshots from disk", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const active = makeEpic("active-epic", "2026-01-02T00:00:00.000Z");
      const retired = makeEpic("retired-epic", "2026-01-01T00:00:00.000Z");
      retired.progress = { ...retired.progress, status: "completed" };
      await saveActiveEpicProjection(legacy.paths.activeEpics, active);
      await saveRetiredEpicProjection(legacy.paths.retiredEpics, retired.id, {
        epic_snapshot: retired,
        retired_at: "2026-01-03T00:00:00.000Z",
        retired_by: "test",
        evidence: "disk projection test",
        source_workflow_id: "removed-temporal-source",
        source_version: 0,
        projection_status: "retired",
      });

      const store = makeStore(legacy);
      expect(await store.epics.list({ status: "active" })).toEqual([active]);
      expect(await store.epics.list({ status: "all" })).toEqual([
        active,
        retired,
      ]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("returns a typed not-found result for a missing epic projection", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const result = await makeStore(legacy).epics.get("missing-epic");
      expect(result).toEqual({ success: true, data: null });
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
