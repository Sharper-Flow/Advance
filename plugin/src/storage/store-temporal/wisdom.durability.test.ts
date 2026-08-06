import { describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../../__tests__/setup";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

describe("wisdom projection durability", () => {
  it("reads persisted wisdom after the store is recreated", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const wisdom = {
        id: "ws-durable",
        type: "pattern" as const,
        content: "disk",
        recorded_at: "2026-01-01T00:00:00.000Z",
      };
      const change = {
        ...SAMPLE_CHANGE,
        id: "wisdom-durable",
        wisdom: [wisdom],
      };
      await legacy.changes.save(change);

      const store = createTemporalStoreBackend({
        legacy: await createDiskStore(tempDir),
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      expect(await store.wisdom.list(change.id)).toEqual([wisdom]);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
