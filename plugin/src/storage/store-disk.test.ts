import { describe, expect, it } from "vitest";

import { createTempDir, cleanupTempDir } from "../__tests__/setup";
import { createDiskStore } from "./store-disk";

describe("createDiskStore", () => {
  it("persists change and task operations directly on disk", async () => {
    const tempDir = await createTempDir();
    try {
      const store = await createDiskStore(tempDir);
      const created = await store.changes.create("Disk Store Smoke");

      const loaded = await store.changes.get(created.changeId);
      expect(loaded.success).toBe(true);
      expect(loaded.data?.title).toBe("Disk Store Smoke");

      const task = await store.tasks.add(created.changeId, "Do disk work");
      expect(task.status).toBe("pending");

      const ready = await store.tasks.ready(created.changeId);
      expect(ready.ready.map((item) => item.id)).toContain(task.id);

      const done = await store.tasks.update(task.id, "done");
      expect(done?.status).toBe("done");

      const listed = await store.changes.list({ includeArchived: true });
      expect(listed.changes).toContainEqual(
        expect.objectContaining({
          id: created.changeId,
          title: "Disk Store Smoke",
          taskCount: 1,
          completedTasks: 1,
        }),
      );
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("warns and creates a unique id for duplicate change summaries", async () => {
    const tempDir = await createTempDir();
    try {
      const store = await createDiskStore(tempDir);
      const first = await store.changes.create("Duplicate Summary");
      const second = await store.changes.create("Duplicate Summary");

      expect(second.changeId).not.toBe(first.changeId);
      expect(second.duplicateWarning).toContain(first.changeId);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
