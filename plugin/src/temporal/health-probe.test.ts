import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRegisteredTemporalWorkerQueues: vi.fn(() => [
    "advance-proj-a",
    "advance-proj-b",
  ]),
  getTemporalWorkerAliveness: vi.fn(() => true),
  canReachTemporalAddress: vi.fn(async () => true),
  createTemporalClientBundle: vi.fn(async () => ({
    connection: { close: vi.fn(async () => {}) },
  })),
}));

vi.mock("../plugin-init", async () => {
  const actual =
    await vi.importActual<typeof import("../plugin-init")>("../plugin-init");
  return {
    ...actual,
    getRegisteredTemporalWorkerQueues: mocks.getRegisteredTemporalWorkerQueues,
    getTemporalWorkerAliveness: mocks.getTemporalWorkerAliveness,
  };
});

vi.mock("./client", async () => {
  const actual = await vi.importActual<typeof import("./client")>("./client");
  return {
    ...actual,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
  };
});

vi.mock("./runtime-manager", async () => {
  const actual =
    await vi.importActual<typeof import("./runtime-manager")>(
      "./runtime-manager",
    );
  return {
    ...actual,
    canReachTemporalAddress: mocks.canReachTemporalAddress,
  };
});

import {
  getTemporalHealth,
  resetTemporalHealthProbeState,
  setTemporalHealthProbeState,
} from "./health-probe";

describe("getTemporalHealth (C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTemporalHealthProbeState();
  });

  it("reports server_alive=true, worker_alive=true, queues, last_op_at, last_error when everything is healthy", async () => {
    setTemporalHealthProbeState({
      lastOpAt: "2026-04-21T00:00:00.000Z",
      lastError: null,
    });

    const health = await getTemporalHealth();

    expect(health.server_alive).toBe(true);
    expect(health.worker_alive).toBe(true);
    expect(health.registered_queues).toEqual([
      "advance-proj-a",
      "advance-proj-b",
    ]);
    expect(health.last_op_at).toBe("2026-04-21T00:00:00.000Z");
    expect(health.last_error).toBeNull();
  });

  it("reports server_alive=false and worker_alive=false when Temporal connection probe fails and no worker queues are registered", async () => {
    mocks.createTemporalClientBundle.mockRejectedValueOnce(
      new Error("connect ECONNREFUSED 127.0.0.1:7233"),
    );
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValueOnce([]);
    setTemporalHealthProbeState({
      lastOpAt: null,
      lastError: "connect ECONNREFUSED 127.0.0.1:7233",
    });

    const health = await getTemporalHealth();

    expect(health.server_alive).toBe(false);
    expect(health.worker_alive).toBe(false);
    expect(health.registered_queues).toEqual([]);
    expect(health.last_op_at).toBeNull();
    expect(health.last_error).toContain("ECONNREFUSED");
  });

  it("reports worker_process_alive=true when the registered worker is alive (OOP or in-process)", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValueOnce(true);
    setTemporalHealthProbeState({
      lastOpAt: "2026-04-21T00:00:00.000Z",
      lastError: null,
    });

    const health = await getTemporalHealth();

    expect(health.worker_process_alive).toBe(true);
  });

  it("reports worker_process_alive=false when the OOP worker's child processes are dead", async () => {
    mocks.getTemporalWorkerAliveness.mockReturnValueOnce(false);
    setTemporalHealthProbeState({
      lastOpAt: "2026-04-21T00:00:00.000Z",
      lastError: null,
    });

    const health = await getTemporalHealth();

    expect(health.worker_process_alive).toBe(false);
  });
});
