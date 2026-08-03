import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTemporalHealth,
  isWorkerAffirmativelyAlive,
  resetTemporalHealthProbeState,
} from "./health-probe";
import { createMockOwner } from "./__tests__/mock-owner";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCanReachTemporalAddress = vi.fn();
const mockGetTemporalWorkerAliveness = vi.fn();
const mockHasResolvedWorkerRole = vi.fn();
const mockGetRegisteredTemporalWorkerQueues = vi.fn();
const mockGetTemporalAddress = vi.fn();
const mockGetTemporalNamespace = vi.fn();
const mockBuildProjectTaskQueue = vi.fn();
const mockProbeTaskQueuePollers = vi.fn();
const mockGetService = vi.fn();
const mockGetTemporalRetryTelemetry = vi.fn();
const mockGetTemporalOpTelemetry = vi.fn();
const mockGetLastWorkerRunError = vi.fn();

vi.mock("./runtime-manager", () => ({
  canReachTemporalAddress: (...args: unknown[]) =>
    mockCanReachTemporalAddress(...args),
}));

vi.mock("../plugin-init", () => ({
  getTemporalWorkerAliveness: () => mockGetTemporalWorkerAliveness(),
  hasResolvedWorkerRole: () => mockHasResolvedWorkerRole(),
  getRegisteredTemporalWorkerQueues: () =>
    mockGetRegisteredTemporalWorkerQueues(),
}));

vi.mock("./client", () => ({
  getTemporalAddress: (...args: unknown[]) => mockGetTemporalAddress(...args),
  getTemporalNamespace: (...args: unknown[]) =>
    mockGetTemporalNamespace(...args),
  buildProjectTaskQueue: (...args: unknown[]) =>
    mockBuildProjectTaskQueue(...args),
}));

vi.mock("./queue-serviceability", () => ({
  probeTaskQueuePollers: (...args: unknown[]) =>
    mockProbeTaskQueuePollers(...args),
}));

vi.mock("./service", () => ({
  getService: () => mockGetService(),
}));

vi.mock("./retry-wrapper", () => ({
  getTemporalRetryTelemetry: () => mockGetTemporalRetryTelemetry(),
  getTemporalOpTelemetry: () => mockGetTemporalOpTelemetry(),
  getLastWorkerRunError: () => mockGetLastWorkerRunError(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isWorkerAffirmativelyAlive", () => {
  it("accepts available true", () => {
    expect(
      isWorkerAffirmativelyAlive({ status: "available", value: true }),
    ).toBe(true);
  });

  it("rejects available false", () => {
    expect(
      isWorkerAffirmativelyAlive({ status: "available", value: false }),
    ).toBe(false);
  });

  it("rejects unavailable without conflating it with available false", () => {
    const availableFalse = { status: "available" as const, value: false };
    const unavailable = {
      status: "unavailable" as const,
      reason: "not_host_capable" as const,
    };

    expect(unavailable).not.toEqual(availableFalse);
    expect(isWorkerAffirmativelyAlive(availableFalse)).toBe(false);
    expect(isWorkerAffirmativelyAlive(unavailable)).toBe(false);
  });
});

describe("getTemporalHealth — server poller probe integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTemporalHealthProbeState();

    // Default happy-path stubs
    mockCanReachTemporalAddress.mockResolvedValue(true);
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockHasResolvedWorkerRole.mockReturnValue(true);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mockGetTemporalAddress.mockReturnValue("127.0.0.1:7233");
    mockGetTemporalNamespace.mockReturnValue("default");
    mockBuildProjectTaskQueue.mockImplementation((pid: string) => `adv-${pid}`);
    mockGetService.mockReturnValue(createMockOwner());
    mockGetTemporalRetryTelemetry.mockReturnValue({
      lastOpAt: null,
      lastError: null,
    });
    mockGetTemporalOpTelemetry.mockReturnValue([]);
    mockGetLastWorkerRunError.mockReturnValue(null);
  });

  it("reports worker liveness as unavailable when worker role was never resolved", async () => {
    mockHasResolvedWorkerRole.mockReturnValue(false);
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);

    const health = await getTemporalHealth();

    expect(health.worker_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
    expect(health.worker_process_alive).toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
  });

  it("reports a client-role host as available false, unlike never-resolved", async () => {
    // Client-role hosts are host-capable but intentionally spawn no worker:
    // plugin-init.ts:280 marks the role resolved before the spawn block at
    // :289. Moving workerRoleResolved into that block would regress this case
    // to not_host_capable.
    mockHasResolvedWorkerRole.mockReturnValue(true);
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);

    const health = await getTemporalHealth();

    expect(health.worker_alive).toEqual({ status: "available", value: false });
    expect(health.worker_process_alive).toEqual({
      status: "available",
      value: false,
    });
    expect(health.worker_process_alive).not.toEqual({
      status: "unavailable",
      reason: "not_host_capable",
    });
  });

  it("worker_alive returns true when serverPollerProbe.status === 'fresh' even with worker_process_alive=false and no registered queues", async () => {
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 5000,
    });

    const health = await getTemporalHealth("proj123");

    expect(health.worker_alive).toEqual({ status: "available", value: true });
    expect(health.worker_process_alive).toEqual({
      status: "available",
      value: false,
    });
    expect(health.registered_queues).toEqual([]);
    expect(health.server_poller_probe).toEqual({
      status: "fresh",
      lastAccessMs: 5000,
    });
  });

  it("worker_process_alive is preserved as a separate field", async () => {
    mockGetTemporalWorkerAliveness.mockReturnValue(true);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue(["adv-proj123"]);
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 3000,
    });

    const health = await getTemporalHealth("proj123");

    expect(health.worker_process_alive).toEqual({
      status: "available",
      value: true,
    });
    expect(health.worker_alive).toEqual({ status: "available", value: true });
  });

  it("caches poller probe result within 30s TTL and avoids redundant API calls", async () => {
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });

    const now = Date.now();
    vi.setSystemTime(now);

    // First call — should hit the API
    await getTemporalHealth("proj123");
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(1);

    // Second call 15s later — should use cache
    vi.setSystemTime(now + 15_000);
    await getTemporalHealth("proj123");
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(1);

    // Third call 29s later — still within TTL
    vi.setSystemTime(now + 29_000);
    await getTemporalHealth("proj123");
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(1);
  });

  it("keys poller probe cache by project task queue", async () => {
    mockProbeTaskQueuePollers
      .mockResolvedValueOnce({ status: "fresh", lastAccessMs: 1000 })
      .mockResolvedValueOnce({ status: "unavailable", lastAccessMs: null });

    const now = Date.now();
    vi.setSystemTime(now);

    const projectA = await getTemporalHealth("proj-a");
    const projectB = await getTemporalHealth("proj-b");

    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(2);
    expect(mockProbeTaskQueuePollers).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ taskQueue: "adv-proj-a" }),
    );
    expect(mockProbeTaskQueuePollers).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ taskQueue: "adv-proj-b" }),
    );
    expect(projectA.worker_alive).toEqual({ status: "available", value: true });
    expect(projectB.worker_alive).toEqual({
      status: "available",
      value: false,
    });
  });

  it("refreshes poller probe cache after TTL expiry (30s)", async () => {
    mockProbeTaskQueuePollers
      .mockResolvedValueOnce({ status: "fresh", lastAccessMs: 1000 })
      .mockResolvedValueOnce({ status: "fresh", lastAccessMs: 2000 });

    const now = Date.now();
    vi.setSystemTime(now);

    // First call
    await getTemporalHealth("proj123");
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(1);

    // Advance past TTL
    vi.setSystemTime(now + 30_001);
    await getTemporalHealth("proj123");
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(2);
  });

  it("skips probe when getService returns null", async () => {
    mockGetService.mockReturnValue(null);

    const health = await getTemporalHealth("proj123");

    expect(mockProbeTaskQueuePollers).not.toHaveBeenCalled();
    expect(health.server_poller_probe).toBeNull();
    expect(health.worker_alive).toEqual({
      status: "available",
      value: false,
    }); // worker_process_alive=false, no queues
  });

  it("skips probe when _projectId is undefined", async () => {
    const health = await getTemporalHealth(undefined);

    expect(mockProbeTaskQueuePollers).not.toHaveBeenCalled();
    expect(health.server_poller_probe).toBeNull();
  });

  it("handles probeTaskQueuePollers failure gracefully", async () => {
    mockProbeTaskQueuePollers.mockRejectedValue(new Error("boom"));

    const health = await getTemporalHealth("proj123");

    expect(health.server_poller_probe).toBeNull();
    expect(health.worker_alive).toEqual({
      status: "available",
      value: false,
    });
  });
});

describe("getTemporalHealth — multi-queue probing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTemporalHealthProbeState();

    mockCanReachTemporalAddress.mockResolvedValue(true);
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockHasResolvedWorkerRole.mockReturnValue(true);
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);
    mockGetTemporalAddress.mockReturnValue("127.0.0.1:7233");
    mockGetTemporalNamespace.mockReturnValue("default");
    mockBuildProjectTaskQueue.mockImplementation((pid: string) => `adv-${pid}`);
    mockGetService.mockReturnValue(createMockOwner());
    mockGetTemporalRetryTelemetry.mockReturnValue({
      lastOpAt: null,
      lastError: null,
    });
    mockGetTemporalOpTelemetry.mockReturnValue([]);
    mockGetLastWorkerRunError.mockReturnValue(null);
  });

  it("probes multiple queues and tags each result with its type", async () => {
    mockProbeTaskQueuePollers
      .mockResolvedValueOnce({
        status: "fresh",
        lastAccessMs: 1000,
        pollerCount: 2,
        lastPollerAt: "2024-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        status: "stale",
        lastAccessMs: 120_000,
        pollerCount: 1,
        lastPollerAt: "2023-01-01T00:00:00.000Z",
      });

    const health = await getTemporalHealth([
      { queueName: "advance-P-sess-A", queueType: "session" },
      { queueName: "advance-P", queueType: "project" },
    ]);

    expect(health.queues).toHaveLength(2);
    expect(health.queues![0]).toEqual({
      queueName: "advance-P-sess-A",
      queueType: "session",
      serviceable: true,
      pollerCount: 2,
      lastPollerAt: "2024-01-01T00:00:00.000Z",
    });
    expect(health.queues![1]).toEqual({
      queueName: "advance-P",
      queueType: "project",
      serviceable: false,
      pollerCount: 1,
      lastPollerAt: "2023-01-01T00:00:00.000Z",
    });
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(2);
    expect(mockProbeTaskQueuePollers).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ taskQueue: "advance-P-sess-A" }),
    );
    expect(mockProbeTaskQueuePollers).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ taskQueue: "advance-P" }),
    );
  });

  it("returns an empty queues array for an empty target list", async () => {
    const health = await getTemporalHealth([]);

    expect(health.queues).toEqual([]);
    expect(health.worker_alive).toEqual({
      status: "available",
      value: false,
    });
    expect(mockProbeTaskQueuePollers).not.toHaveBeenCalled();
  });

  it("caches poller probe results per queue name", async () => {
    mockProbeTaskQueuePollers
      .mockResolvedValueOnce({
        status: "fresh",
        lastAccessMs: 1000,
        pollerCount: 1,
        lastPollerAt: "2024-01-01T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        status: "fresh",
        lastAccessMs: 2000,
        pollerCount: 1,
        lastPollerAt: "2024-01-02T00:00:00.000Z",
      });

    const now = Date.now();
    vi.setSystemTime(now);

    const first = await getTemporalHealth([
      { queueName: "advance-A-sess-1", queueType: "session" },
      { queueName: "advance-A", queueType: "project" },
    ]);
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(2);
    expect(first.queues).toHaveLength(2);

    // Second call within TTL should reuse cache for both queues.
    vi.setSystemTime(now + 15_000);
    const second = await getTemporalHealth([
      { queueName: "advance-A-sess-1", queueType: "session" },
      { queueName: "advance-A", queueType: "project" },
    ]);
    expect(mockProbeTaskQueuePollers).toHaveBeenCalledTimes(2);
    expect(second.queues).toEqual(first.queues);
  });

  it("wraps a single projectId string into a single project queue target", async () => {
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
      pollerCount: 1,
      lastPollerAt: "2024-01-01T00:00:00.000Z",
    });

    const health = await getTemporalHealth("proj123");

    expect(health.queues).toEqual([
      {
        queueName: "adv-proj123",
        queueType: "project",
        serviceable: true,
        pollerCount: 1,
        lastPollerAt: "2024-01-01T00:00:00.000Z",
      },
    ]);
    expect(health.server_poller_probe).toEqual(
      expect.objectContaining({ status: "fresh" }),
    );
  });
});
