import { describe, expect, it, vi } from "vitest";

import {
  evaluateTargetReadiness,
  markStale,
  resetReadinessState,
} from "./session-readiness";

describe("disabled Temporal session readiness", () => {
  it("is ready without invoking removed queue probes", async () => {
    resetReadinessState();
    const queryProbe = vi.fn();

    const result = await evaluateTargetReadiness({
      targetQueue: "advance-proj-a",
      hasWorkflow: true,
      queryProbe,
    });

    expect(result).toEqual({ ready: true, blockers: [], probeKind: "none" });
    expect(queryProbe).not.toHaveBeenCalled();
  });

  it("stale markers do not reintroduce queue probing", async () => {
    resetReadinessState();
    markStale("advance-proj-a");
    const queryProbe = vi.fn();

    const result = await evaluateTargetReadiness({
      targetQueue: "advance-proj-a",
      hasWorkflow: true,
      queryProbe,
    });

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(queryProbe).not.toHaveBeenCalled();
  });
});
