import { describe, expect, it } from "vitest";

import {
  createTempDir,
  cleanupTempDir,
  SAMPLE_CHANGE,
} from "../../__tests__/setup";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

describe("task projection durability", () => {
  it("reads the persisted task after the store is recreated", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const change = {
        ...SAMPLE_CHANGE,
        id: "task-durable",
        tasks: [
          {
            id: "tk-durable",
            title: "Persisted task",
            type: "code" as const,
            status: "done" as const,
            priority: 0,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      };
      await legacy.changes.save(change);

      const first = createTemporalStoreBackend({
        legacy,
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      expect(await first.tasks.list(change.id)).toEqual(change.tasks);

      const recreated = createTemporalStoreBackend({
        legacy: await createDiskStore(tempDir),
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      expect(await recreated.tasks.list(change.id)).toEqual(change.tasks);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });

  it("returns no task data when the disk projection is absent", async () => {
    const tempDir = await createTempDir();
    try {
      const store = createTemporalStoreBackend({
        legacy: await createDiskStore(tempDir),
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      expect(await store.tasks.list("missing-change")).toEqual([]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
