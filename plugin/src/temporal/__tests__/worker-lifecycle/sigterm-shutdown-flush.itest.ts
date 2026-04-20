/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import { sigtermTriggersBoundedFlush } from "./worker-lifecycle";

describe("worker lifecycle - SIGTERM flush", () => {
  it("triggers bounded flush semantics", async () => {
    const result = await sigtermTriggersBoundedFlush({ flushTimeoutMs: 5_000 });
    expect(result.pass).toBe(true);
    expect(result.flushCalls).toBe(1);
    expect(result.closeCalls).toBeGreaterThanOrEqual(1);
  });
});
