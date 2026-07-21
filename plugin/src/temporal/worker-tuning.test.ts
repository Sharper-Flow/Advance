import { describe, expect, it } from "vitest";

import { getAdvWorkerTuningOptions } from "./worker-tuning";

describe("getAdvWorkerTuningOptions", () => {
  it("returns defaults when env is empty", () => {
    const result = getAdvWorkerTuningOptions({});

    expect(result.workflowTaskPollerBehavior).toEqual({
      type: "simple-maximum",
      maximum: 1,
    });
    expect(result.activityTaskPollerBehavior).toEqual({
      type: "simple-maximum",
      maximum: 1,
    });
    expect(result.maxConcurrentWorkflowTaskExecutions).toBe(4);
    expect(result.maxConcurrentActivityTaskExecutions).toBe(4);
    expect(result.maxConcurrentLocalActivityExecutions).toBe(4);
    expect(result.maxActivitiesPerSecond).toBe(10);
  });

  it("overrides values from env", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "2",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(2);
  });

  it("falls back to defaults for malformed env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_WORKFLOW_POLLER_CAP: "not-a-number",
    });

    expect(result.workflowTaskPollerBehavior.maximum).toBe(1);
  });

  it("falls back to defaults for negative env values", () => {
    const result = getAdvWorkerTuningOptions({
      ADV_WORKER_ACTIVITY_RATE: "-5",
    });

    expect(result.maxActivitiesPerSecond).toBe(10);
  });
});
