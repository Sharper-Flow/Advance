/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import {
  compareMemoryBudget,
  computePeakRss,
  computeSteadyStateBaseline,
} from "./memory-probe";

describe("memory probe helpers", () => {
  it("computes peak RSS from samples", () => {
    expect(computePeakRss([10, 40, 20, 30])).toBe(40);
  });

  it("computes steady-state baseline as the first sample", () => {
    expect(computeSteadyStateBaseline([111, 222, 333])).toBe(111);
  });

  it("passes when peak RSS is at or below 2 GB", () => {
    const result = compareMemoryBudget({
      peakRssBytes: 2 * 1024 * 1024 * 1024,
      budgetBytes: 2 * 1024 * 1024 * 1024,
    });
    expect(result.pass).toBe(true);
  });

  it("fails when peak RSS exceeds 2 GB", () => {
    const result = compareMemoryBudget({
      peakRssBytes: 2 * 1024 * 1024 * 1024 + 1,
      budgetBytes: 2 * 1024 * 1024 * 1024,
    });
    expect(result.pass).toBe(false);
    expect(result.excessBytes).toBe(1);
  });
});
