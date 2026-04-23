import { describe, it, expect, beforeEach } from "vitest";
import {
  incrementFallbackCount,
  getTemporalFallbackTelemetry,
  resetTemporalFallbackTelemetry,
} from "./fallback-telemetry";

describe("fallback-telemetry", () => {
  beforeEach(() => {
    resetTemporalFallbackTelemetry();
  });

  it("increments count for each domain", () => {
    incrementFallbackCount("changes");
    incrementFallbackCount("tasks");
    incrementFallbackCount("wisdom");
    incrementFallbackCount("gates");

    const counts = getTemporalFallbackTelemetry();
    expect(counts.changes).toBe(1);
    expect(counts.tasks).toBe(1);
    expect(counts.wisdom).toBe(1);
    expect(counts.gates).toBe(1);
  });

  it("accumulates multiple increments for the same domain", () => {
    incrementFallbackCount("changes");
    incrementFallbackCount("changes");
    incrementFallbackCount("changes");

    expect(getTemporalFallbackTelemetry().changes).toBe(3);
  });

  it("returns current counts after mixed increments", () => {
    incrementFallbackCount("changes");
    incrementFallbackCount("changes");
    incrementFallbackCount("tasks");
    incrementFallbackCount("wisdom");
    incrementFallbackCount("wisdom");
    incrementFallbackCount("wisdom");

    const counts = getTemporalFallbackTelemetry();
    expect(counts).toEqual({
      changes: 2,
      tasks: 1,
      wisdom: 3,
      gates: 0,
    });
  });

  it("resets all counters to zero", () => {
    incrementFallbackCount("changes");
    incrementFallbackCount("tasks");
    incrementFallbackCount("wisdom");
    incrementFallbackCount("gates");

    resetTemporalFallbackTelemetry();

    expect(getTemporalFallbackTelemetry()).toEqual({
      changes: 0,
      tasks: 0,
      wisdom: 0,
      gates: 0,
    });
  });

  it("returns a copy — mutations do not affect internal state", () => {
    incrementFallbackCount("changes");

    const copy = getTemporalFallbackTelemetry();
    copy.changes = 999;

    expect(getTemporalFallbackTelemetry().changes).toBe(1);
  });
});
