import { describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";

function change(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: id,
    status: "draft",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: { capability: [] },
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

describe("active conflict authority disk benchmark", () => {
  it("loads 50 durable active projections without workflow fallback", async () => {
    const tempDir = await createTempDir();
    try {
      const legacy = await createDiskStore(tempDir);
      for (let i = 0; i < 50; i++) {
        await legacy.changes.save(
          change(`active-${String(i).padStart(2, "0")}`),
        );
      }
      const store = createTemporalStoreBackend({
        legacy,
        temporal: {} as never,
        projectId: "0".repeat(40),
      });

      const started = Date.now();
      const result = await store.changes.listConflictAuthority!({
        concurrency: 8,
      });
      const elapsed = Date.now() - started;

      expect(result.completeness).toBe("complete");
      expect(result.canConcludeClean).toBe(true);
      expect(result.active).toHaveLength(50);
      expect(result.omittedCount).toBe(0);
      expect(elapsed).toBeLessThan(8_000);
    } finally {
      await cleanupTempDir(tempDir);
    }
  });
});
