import { describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  SAMPLE_CHANGE,
} from "../../__tests__/setup";
import { createDefaultGates } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

describe("gate projection durability", () => {
  it("reads persisted gates after the store is recreated", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      const change = {
        ...SAMPLE_CHANGE,
        id: "gates-durable",
        gates: createDefaultGates(),
      };
      await legacy.changes.save(change);

      const store = createTemporalStoreBackend({
        legacy: await createDiskStore(tempDir),
        temporal: {} as never,
        projectId: "0".repeat(40),
      });
      expect(await store.gates.get(change.id)).toEqual(change.gates);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
