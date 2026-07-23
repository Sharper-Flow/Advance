/**
 * status-health.test.ts
 *
 * Tests for health snapshot helpers and timeout false-down guards.
 */

import { describe, test, expect } from "vitest";
import { buildTemporalHealthFallback } from "./status-health";

describe("buildTemporalHealthFallback", () => {
  test("timeout errors keep server/worker alive with probe_degraded", () => {
    const err = new Error("Probe cache fetch failed: The operation timed out");
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(true);
    expect(snapshot.worker_alive).toBe(true);
    expect(snapshot.worker_process_alive).toBe(true);
    expect(snapshot.probe_degraded).toBe(true);
    expect(snapshot.last_error).toContain("timed out");
  });

  test("TimeoutError name keeps server/worker alive with probe_degraded", () => {
    const err = new Error("The operation timed out");
    err.name = "TimeoutError";
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(true);
    expect(snapshot.probe_degraded).toBe(true);
  });

  test("non-timeout errors mark everything down", () => {
    const err = new Error("connection refused");
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(false);
    expect(snapshot.worker_alive).toBe(false);
    expect(snapshot.worker_process_alive).toBe(false);
    expect(snapshot.probe_degraded).toBeUndefined();
  });
});
