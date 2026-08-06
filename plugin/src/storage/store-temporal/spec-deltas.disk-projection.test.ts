import { describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../../__tests__/setup";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

const DELTA = {
  id: "dl-disk-1",
  operation: "add" as const,
  requirement: {
    id: "rq-disk-1",
    title: "Disk projection delta",
    body: "The delta remains readable after persistence.",
    priority: "must" as const,
    scenarios: [],
  },
};

describe("spec delta disk projection", () => {
  it("persists and reads the appended delta from disk after store recreation", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const change = {
        ...SAMPLE_CHANGE,
        id: "spec-delta-disk",
        deltas: { "collection-dashboard": [DELTA] },
      };
      await legacy.changes.save(change);

      const store = createTemporalStoreBackend({
        legacy: await createDiskStore(tempDir),
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      const result = await store.changes.get(change.id);
      expect(result.success).toBe(true);
      expect(result.data?.deltas["collection-dashboard"]).toEqual([DELTA]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
