/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import { duplicateSignalIsIdempotent } from "./worker-lifecycle";

describe("worker lifecycle - duplicate signal", () => {
  it("keeps duplicate signals idempotent", async () => {
    const result = await duplicateSignalIsIdempotent();
    expect(result.pass).toBe(true);
    expect(result.flushCalls).toBe(1);
  });
});
