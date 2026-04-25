import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRegisteredTemporalWorkerQueues: vi.fn(() => [
    "advance-proj-a",
    "advance-proj-b",
  ]),
  getTemporalWorkerAliveness: vi.fn(() => true),
  canReachTemporalAddress: vi.fn(async () => true),
  getService: vi.fn(() => ({
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: { close: vi.fn(async () => {}) },
    client: {},
  })),
  buildProjectTaskQueue: vi.fn((projectId: string) => `advance-${projectId}`),
  createTemporalClientBundle: vi.fn(async () => ({
    address: "127.0.0.1:7233",
    namespace: "default",
    connection: { close: vi.fn(async () => {}) },
    client: {
      workflow: {
        count: vi.fn(async () => ({ count: 0 })),
      },
    },
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
    buildProjectTaskQueue: mocks.buildProjectTaskQueue,
    createTemporalClientBundle: mocks.createTemporalClientBundle,
  };
});

vi.mock("./service", async () => {
  const actual = await vi.importActual<typeof import("./service")>("./service");
  return {
    ...actual,
    getService: mocks.getService,
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
import {
  resetTemporalFallbackTelemetry,
  incrementFallbackCount,
} from "./fallback-telemetry";

describe("getTemporalHealth (C3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTemporalHealthProbeState();
    resetTemporalFallbackTelemetry();
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

  it("reports server_alive=false and worker_alive=false when Temporal service is not available and no worker queues are registered", async () => {
    mocks.getService.mockReturnValueOnce(null);
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

  it("surfaces reconnect_count from getStslStats (Task 5 — KD-6)", async () => {
    // RED: TemporalHealth.reconnect_count must reflect StslStats.reconnectCount.
    // Initially 0 in the live service; force one increment via the runtime
    // counter and assert the field propagates.
    const { resetStsl, initStsl, reinitStsl, closeStsl } = await import(
      "./service"
    );
    resetStsl();
    await initStsl({
      ADV_TEMPORAL_ADDRESS: "127.0.0.1:7233",
      ADV_TEMPORAL_NAMESPACE: "default",
    });
    await reinitStsl();
    const health = await getTemporalHealth();
    expect(health).toHaveProperty("reconnect_count", 1);
    await closeStsl();
    resetStsl();
  });

  it("includes fallback_counts with per-domain counters", async () => {
    incrementFallbackCount("tasks");
    incrementFallbackCount("tasks");
    incrementFallbackCount("changes");
    setTemporalHealthProbeState({
      lastOpAt: "2026-04-21T00:00:00.000Z",
      lastError: null,
    });

    const health = await getTemporalHealth();

    expect(health.fallback_counts).toEqual({
      changes: 1,
      tasks: 2,
      wisdom: 0,
      gates: 0,
    });
  });

  it("returns stale_queues=[] when projectId is undefined", async () => {
    const health = await getTemporalHealth();
    expect(health.stale_queues).toEqual([]);
    expect(mocks.createTemporalClientBundle).not.toHaveBeenCalled();
  });

  it("returns stale_queues=[] when the project queue is in registered_queues", async () => {
    mocks.getRegisteredTemporalWorkerQueues.mockReturnValueOnce([
      "advance-proj-a",
      "advance-proj-b",
      "advance-target-proj",
    ]);
    const health = await getTemporalHealth("target-proj");
    expect(health.stale_queues).toEqual([]);
    expect(mocks.createTemporalClientBundle).not.toHaveBeenCalled();
  });

  it("returns stale_queues=[] when count() returns zero", async () => {
    mocks.createTemporalClientBundle.mockResolvedValueOnce({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: { close: vi.fn(async () => {}) },
      client: {
        workflow: {
          count: vi.fn(async () => ({ count: 0 })),
        },
      },
    });

    const health = await getTemporalHealth("target-proj");
    expect(health.stale_queues).toEqual([]);
  });

  it("returns stale_queues with running_count when count() returns > 0 and queue is not registered", async () => {
    mocks.createTemporalClientBundle.mockResolvedValueOnce({
      address: "127.0.0.1:7233",
      namespace: "default",
      connection: { close: vi.fn(async () => {}) },
      client: {
        workflow: {
          count: vi.fn(async () => ({ count: 42 })),
        },
      },
    });

    const health = await getTemporalHealth("target-proj");
    expect(health.stale_queues).toEqual([
      { queue: "advance-target-proj", running_count: 42 },
    ]);
  });
});
