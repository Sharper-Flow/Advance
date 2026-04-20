/**
 * @deprecated Validation-only artifact for `validateTemporalStorageShapeIs`.
 * Remove in `migrateAdvStateTemporalRetire` once the Temporal cutover
 * decision is made.
 */

import { describe, expect, it } from "vitest";
import {
  compareLatencyBudgets,
  computePercentiles,
  discardWarmup,
} from "./latency-bench";

describe("latency bench helpers", () => {
  it("discards the configured warmup iterations", () => {
    expect(discardWarmup([1, 2, 3, 4, 5], 2)).toEqual([3, 4, 5]);
  });

  it("computes p50/p95/p99 percentiles", () => {
    const p = computePercentiles([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(p.p50).toBe(50);
    expect(p.p95).toBe(100);
    expect(p.p99).toBe(100);
  });

  it("fails the budget when any Temporal p95 ratio exceeds 2x legacy", () => {
    const result = compareLatencyBudgets({
      taskUpdate: { legacyP95: 10, temporalP95: 15 },
      changeGet: { legacyP95: 20, temporalP95: 30 },
      gateComplete: { legacyP95: 10, temporalP95: 25 },
    });
    expect(result.pass).toBe(false);
    expect(result.failedOps).toEqual(["gateComplete"]);
    expect(result.ratios.gateComplete).toBe(2.5);
  });

  it("passes when all Temporal p95 ratios are <= 2x legacy", () => {
    const result = compareLatencyBudgets({
      taskUpdate: { legacyP95: 10, temporalP95: 19 },
      changeGet: { legacyP95: 20, temporalP95: 30 },
      gateComplete: { legacyP95: 10, temporalP95: 20 },
    });
    expect(result.pass).toBe(true);
    expect(result.failedOps).toEqual([]);
  });
});
