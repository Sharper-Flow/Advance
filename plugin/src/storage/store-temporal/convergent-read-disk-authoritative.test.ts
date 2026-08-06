import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../../__tests__/setup";
import { createDefaultGates, type Change } from "../../types";
import { createDiskStore } from "../store-disk";
import { createTemporalStoreBackend } from "./index";
import { createTemporalReadContext } from "./shared";

let tempDir: string | undefined;

function activeChange(id: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Active ${id}`,
    status: "draft",
    created_at: "2026-05-07T00:00:00.000Z",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  };
}

afterEach(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

describe("disk-authoritative reads", () => {
  it("returns the persisted projection without a workflow query", async () => {
    tempDir = await createTempDir();
    const legacy = await createDiskStore(tempDir);
    await legacy.changes.save(activeChange("disk-change"));
    const store = createTemporalStoreBackend({
      legacy,
      temporal: {} as never,
      projectId: "0".repeat(40),
    });

    const result = await store.changes.get("disk-change");
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("disk-change");
    expect(result.source).toBe("disk");
  });

  it("does not hang or fabricate data for a missing projection", async () => {
    tempDir = await createTempDir();
    const store = createTemporalStoreBackend({
      legacy: await createDiskStore(tempDir),
      temporal: {} as never,
      projectId: "0".repeat(40),
    });
    const result = await store.changes.get("missing-change");
    expect(result.success).toBe(false);
    expect(result.type).toBe("not_found");
  });

  it("keeps read-context circuit-breaker state independent of disk reads", () => {
    const context = createTemporalReadContext();
    context.recordUnresponsiveMember();
    context.recordUnresponsiveMember();
    context.recordUnresponsiveMember();
    expect(context.isCircuitBreakerTripped()).toBe(true);
    context.recordResponsiveMember();
    expect(context.isCircuitBreakerTripped()).toBe(false);
  });
});
