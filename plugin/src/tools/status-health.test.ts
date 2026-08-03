/**
 * status-health.test.ts
 *
 * Tests for health snapshot helpers and timeout false-down guards.
 */

import { beforeEach, describe, test, expect, vi } from "vitest";
import { buildTemporalHealthFallback } from "./status-health";

const mockHasResolvedWorkerRole = vi.hoisted(() => vi.fn());

vi.mock("../plugin-init", () => ({
  getOrphanQueueAdoptionDiagnostics: vi.fn(),
  getTemporalWorkerAliveness: vi.fn(),
  getTemporalWorkerDiagnostics: vi.fn(),
  hasResolvedWorkerRole: () => mockHasResolvedWorkerRole(),
}));

describe("buildTemporalHealthFallback", () => {
  beforeEach(() => {
    mockHasResolvedWorkerRole.mockReturnValue(true);
  });

  test("timeout errors keep server/worker alive with probe_degraded", () => {
    const err = new Error("Probe cache fetch failed: The operation timed out");
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(true);
    expect(snapshot.worker_alive).toEqual({ status: "available", value: true });
    expect(snapshot.worker_process_alive).toEqual({
      status: "available",
      value: true,
    });
    expect(snapshot.probe_degraded).toBe(true);
    expect(snapshot.last_error).toContain("timed out");
  });

  test("TimeoutError name keeps server/worker alive with probe_degraded", () => {
    const err = new Error("The operation timed out");
    err.name = "TimeoutError";
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(true);
    expect(snapshot.worker_alive).toEqual({ status: "available", value: true });
    expect(snapshot.probe_degraded).toBe(true);
  });

  test("non-timeout errors mark everything down", () => {
    const err = new Error("connection refused");
    const snapshot = buildTemporalHealthFallback(err);

    expect(snapshot.server_alive).toBe(false);
    expect(snapshot.worker_alive).toEqual({
      status: "unavailable",
      reason: "probe_failed",
    });
    expect(snapshot.worker_process_alive).toEqual({
      status: "unavailable",
      reason: "probe_failed",
    });
    expect(snapshot.probe_degraded).toBeUndefined();
  });

  test("unresolved worker role reports not host capable for timeout fallback", () => {
    mockHasResolvedWorkerRole.mockReturnValue(false);

    const snapshot = buildTemporalHealthFallback(new Error("timed out"));

    expect(snapshot.worker_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
    expect(snapshot.worker_process_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
  });
});
