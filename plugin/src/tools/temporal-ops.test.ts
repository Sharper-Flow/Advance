import { beforeEach, describe, expect, test, vi } from "vitest";

import { parseToolOutput } from "../__tests__/setup";
import {
  _temporalOpsProbeCaches,
  classifySuspectWorkerLock,
  isRestartServiceabilityVerified,
  temporalOpsTools,
} from "./temporal-ops";

const {
  mockGetTemporalHealth,
  mockGetService,
  mockGetTemporalWorkerAliveness,
  mockGetTemporalWorkerDiagnostics,
  mockRestartCurrentProjectTemporalWorker,
  mockProbeTaskQueuePollers,
} = vi.hoisted(() => ({
  mockGetTemporalHealth: vi.fn(),
  mockGetService: vi.fn(),
  mockGetTemporalWorkerAliveness: vi.fn(),
  mockGetTemporalWorkerDiagnostics: vi.fn(),
  mockRestartCurrentProjectTemporalWorker: vi.fn(),
  mockProbeTaskQueuePollers: vi.fn(),
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mockGetTemporalHealth,
}));

vi.mock("../temporal/service", () => ({
  getService: mockGetService,
  getStslStats: vi.fn(() => ({
    reconnectCount: 0,
    reconnectFailureCount: 0,
  })),
  reinitStsl: vi.fn(),
}));

vi.mock("../plugin-init", () => ({
  getTemporalWorkerAliveness: mockGetTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics: mockGetTemporalWorkerDiagnostics,
  restartCurrentProjectTemporalWorker: mockRestartCurrentProjectTemporalWorker,
}));

vi.mock("../temporal/queue-serviceability", () => ({
  probeTaskQueuePollers: mockProbeTaskQueuePollers,
  classifyQueueServiceability: vi.fn((input: any) => ({
    status:
      input.serverPollerProbe?.status === "fresh"
        ? "serviceable"
        : "not_serviceable",
    confidence: "server",
    evidence: {
      serverPollerProbe: input.serverPollerProbe?.status ?? "unavailable",
    },
    blockers: [],
  })),
}));

const notServiceable = { status: "not_serviceable" } as const;

const temporalHealth = {
  server_alive: true,
  worker_alive: true,
  worker_process_alive: true,
  registered_queues: [],
  last_op_at: null,
  last_error: null,
  fallback_counts: {},
  stale_queues: [],
  reconnect_count: 0,
  op_counters: [],
  worker_lock: null,
  last_worker_run_error: null,
};

const store = {
  paths: {
    external: "/tmp/adv-state/proj123",
    root: "/repo",
  },
} as any;

beforeEach(() => {
  _temporalOpsProbeCaches.clear();
  mockGetTemporalHealth.mockReset();
  mockGetTemporalHealth.mockResolvedValue({ ...temporalHealth });
  mockGetService.mockReset();
  mockGetService.mockReturnValue(null);
  mockGetTemporalWorkerAliveness.mockReset();
  mockGetTemporalWorkerAliveness.mockReturnValue(false);
  mockGetTemporalWorkerDiagnostics.mockReset();
  mockGetTemporalWorkerDiagnostics.mockReturnValue([]);
  mockRestartCurrentProjectTemporalWorker.mockReset();
  mockProbeTaskQueuePollers.mockReset();
  mockProbeTaskQueuePollers.mockResolvedValue({
    status: "unavailable",
    lastAccessMs: null,
    error: "mock unavailable",
  });
});

function healthWithLock(schemaVersion: 1 | 2) {
  return {
    worker_lock: {
      holder_pid: 1234,
      schema_version: schemaVersion,
    },
  } as any;
}

describe("classifySuspectWorkerLock", () => {
  test("keeps v1 not-serviceable lock classified as live legacy suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(1),
        queueServiceability: notServiceable as any,
      }),
    ).toBe("suspect_live_legacy_lock");
  });

  test("classifies v2 not-serviceable lock as live unserviceable suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(2),
        queueServiceability: notServiceable as any,
      }),
    ).toBe("suspect_live_unserviceable_lock");
  });

  test("does not classify healthy v2 lock as suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: healthWithLock(2),
        queueServiceability: { status: "serviceable" } as any,
      }),
    ).toBeUndefined();
  });

  test("does not classify absent lock as suspect", () => {
    expect(
      classifySuspectWorkerLock({
        health: { worker_lock: null } as any,
        queueServiceability: notServiceable as any,
      }),
    ).toBeUndefined();
  });
});

describe("temporal ops probe cache", () => {
  test("diagnose description and output expose the thin classifier envelope", async () => {
    expect(temporalOpsTools.adv_temporal_diagnose.description).toContain(
      "server, worker, STSL, optional change-workflow reachability, queue serviceability",
    );
    expect(temporalOpsTools.adv_temporal_diagnose.description).not.toContain(
      "search-attribute",
    );

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );

    expect(result).toMatchObject({
      serverReachable: true,
      workerAlive: true,
      stslInitialized: false,
      serverServiceable: false,
      recommendedNextAction: "Temporal is healthy",
    });
  });

  test("diagnose exposes freshness metadata and reuses cached health", async () => {
    const first = parseToolOutput(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );
    const second = parseToolOutput(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );

    expect(mockGetTemporalHealth).toHaveBeenCalledTimes(1);
    expect(first._freshness.temporal_health).toMatchObject({
      cached_at: expect.any(String),
      stale: false,
    });
    expect(second._freshness.temporal_health.cached_at).toBe(
      first._freshness.temporal_health.cached_at,
    );
  });

  test("worker restart still requires approval evidence before any restart or probe mutation", async () => {
    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        { approvedLockReclaim: true },
        store,
      ),
    );

    expect(result).toMatchObject({
      success: false,
      errorClass: "ApprovalRequired",
    });
    expect(mockRestartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
    expect(mockGetTemporalHealth).not.toHaveBeenCalled();
  });

  test("restart verification refuses stale cached serviceability as success", () => {
    expect(
      isRestartServiceabilityVerified({
        serviceability: { status: "serviceable" } as any,
        freshness: {
          cached_at: new Date().toISOString(),
          stale: true,
        },
      }),
    ).toBe(false);
  });

  test("diagnose does not recommend restart when worker is dead but queue has fresh peer pollers", async () => {
    mockGetTemporalHealth.mockResolvedValue({
      ...temporalHealth,
      worker_alive: false,
    });
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    });

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
    );

    expect(result.recommendedNextAction).not.toContain("adv_temporal_restart");
    expect(result.recommendedNextAction).toContain("peer workers");
  });
});
