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

  it("records task evidence idempotently and preserves complete phase after correction", async () => {
    const tempDir = await createTempDir();
    try {
      const store = await createDiskStore(tempDir);
      const created = await store.changes.create("Evidence Policy");
      const task = await store.tasks.add(created.changeId, "Prove evidence");

      await store.tasks.recordEvidence(task.id, "red", {
        command: "vitest",
        exit_code: 1,
        output_snippet: "expected failure",
        recorded_at: "2026-04-14T00:02:00.000Z",
      });
      await store.tasks.recordEvidence(task.id, "red", {
        command: "vitest",
        exit_code: 1,
        output_snippet: "expected failure",
        recorded_at: "2026-04-14T00:03:00.000Z",
      });

      let loaded = await store.tasks.get(task.id);
      expect(loaded?.tdd_evidence?.red?.recorded_at).toBe(
        "2026-04-14T00:02:00.000Z",
      );
      expect(loaded?.tdd_phase).toBe("red");

      await expect(
        store.tasks.recordEvidence(task.id, "red", {
          command: "vitest --changed",
          exit_code: 1,
          output_snippet: "different failure",
          recorded_at: "2026-04-14T00:04:00.000Z",
        }),
      ).rejects.toThrow(/correctionReason/i);

      await store.tasks.recordEvidence(task.id, "green", {
        command: "vitest",
        exit_code: 0,
        output_snippet: "pass",
        recorded_at: "2026-04-14T00:05:00.000Z",
      });
      await store.tasks.recordEvidence(
        task.id,
        "red",
        {
          command: "vitest --changed",
          exit_code: 1,
          output_snippet: "different failure",
          recorded_at: "2026-04-14T00:06:00.000Z",
        },
        { correctionReason: "Attach focused red command." },
      );

      loaded = await store.tasks.get(task.id);
      expect(loaded?.tdd_evidence?.red?.command).toBe("vitest --changed");
      expect(loaded?.tdd_phase).toBe("complete");
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
