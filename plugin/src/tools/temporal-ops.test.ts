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
  mockEnsureProjectTemporalQueue,
  mockGetRegisteredTemporalWorkerQueues,
  mockResolveTargetProject,
  mockGetCurrentSessionId,
} = vi.hoisted(() => ({
  mockGetTemporalHealth: vi.fn(),
  mockGetService: vi.fn(),
  mockGetTemporalWorkerAliveness: vi.fn(),
  mockGetTemporalWorkerDiagnostics: vi.fn(),
  mockRestartCurrentProjectTemporalWorker: vi.fn(),
  mockProbeTaskQueuePollers: vi.fn(),
  mockEnsureProjectTemporalQueue: vi.fn(),
  mockGetRegisteredTemporalWorkerQueues: vi.fn(() => []),
  mockResolveTargetProject: vi.fn(),
  mockGetCurrentSessionId: vi.fn(() => undefined),
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mockGetTemporalHealth,
}));

vi.mock("../utils/session-id", () => ({
  getCurrentSessionId: mockGetCurrentSessionId,
  generateSessionId: vi.fn(() => "sess_generated"),
  setCurrentSessionId: vi.fn(),
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
  ensureProjectTemporalQueue: mockEnsureProjectTemporalQueue,
  getRegisteredTemporalWorkerQueues: mockGetRegisteredTemporalWorkerQueues,
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

vi.mock("../tools/target-project", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../tools/target-project")>();
  return {
    ...original,
    resolveTargetProject: mockResolveTargetProject,
  };
});

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

const targetContext = {
  root: "/repo/target",
  projectId: "target456",
  externalRoot: "/tmp/adv-state/target456",
  trusted: false,
  trustSource: "explicit" as const,
  stateMode: "disk-snapshot" as const,
};

beforeEach(() => {
  _temporalOpsProbeCaches.clear();
  process.env.ADV_WORKER_RESTART_VERIFY_TIMEOUT_MS = "100";
  mockGetTemporalHealth.mockReset();
  mockGetTemporalHealth.mockResolvedValue({ ...temporalHealth });
  mockGetService.mockReset();
  mockGetService.mockReturnValue(null);
  mockGetTemporalWorkerAliveness.mockReset();
  mockGetTemporalWorkerAliveness.mockReturnValue(false);
  mockGetTemporalWorkerDiagnostics.mockReset();
  mockGetTemporalWorkerDiagnostics.mockReturnValue([]);
  mockRestartCurrentProjectTemporalWorker.mockReset();
  mockEnsureProjectTemporalQueue.mockReset();
  mockEnsureProjectTemporalQueue.mockResolvedValue(undefined);
  mockGetRegisteredTemporalWorkerQueues.mockReset();
  mockGetRegisteredTemporalWorkerQueues.mockReturnValue([]);
  mockResolveTargetProject.mockReset();
  mockResolveTargetProject.mockResolvedValue({ ...targetContext });
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

  test("diagnose surfaces per-queue serviceability with type labels when sessionId is present (rq-isolSessionTaskQueue04, AC6)", async () => {
    mockGetTemporalHealth.mockResolvedValue(temporalHealth);
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    } as any);
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });
    mockGetCurrentSessionId.mockReturnValue("sess_diagnose_multi");

    try {
      const result = parseToolOutput(
        await temporalOpsTools.adv_temporal_diagnose.execute({}, store),
      );

      // AC6: per-queue output must distinguish session from project and
      // label each by type.
      expect(result.queues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            queue: "advance-proj123-sess_diagnose_multi",
            queueType: "session",
            serviceable: true,
          }),
          expect.objectContaining({
            queue: "advance-proj123",
            queueType: "project",
            serviceable: true,
          }),
        ]),
      );
    } finally {
      mockGetCurrentSessionId.mockReturnValue(undefined);
      mockProbeTaskQueuePollers.mockReset();
      mockGetService.mockReset();
      mockGetTemporalHealth.mockReset();
      _temporalOpsProbeCaches.clear();
    }
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
      age_ms: expect.any(Number),
      ttl_ms: expect.any(Number),
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
          age_ms: 3_000,
          ttl_ms: 2_000,
        },
      }),
    ).toBe(false);
  });

  test("restart verification accepts only fresh serviceability evidence", () => {
    expect(
      isRestartServiceabilityVerified({
        serviceability: { status: "serviceable" } as any,
        freshness: {
          cached_at: new Date().toISOString(),
          stale: false,
          age_ms: 10,
          ttl_ms: 2_000,
        },
      }),
    ).toBe(true);
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

  test("description mentions target_path and cross-project worker lifecycle", () => {
    expect(temporalOpsTools.adv_temporal_worker_restart.description).toMatch(
      /target_path|target project/i,
    );
  });

  test("target_path cheap ensure registers target queue and verifies serviceability", async () => {
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    });
    mockGetTemporalWorkerAliveness.mockReturnValue(true);
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });
    mockGetRegisteredTemporalWorkerQueues.mockReturnValue([
      "advance-target456",
    ]);

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target restart",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.projectId).toBe("target456");
    expect(result.expectedQueue).toBe("advance-target456");
    expect(result._projectContext).toMatchObject({
      projectId: "target456",
      trusted: false,
    });
    expect(mockEnsureProjectTemporalQueue).toHaveBeenCalledWith("target456");
    expect(mockRestartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
  });

  test("target_path full restart falls back to target worker restart and preserves source queue", async () => {
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    });
    mockRestartCurrentProjectTemporalWorker.mockResolvedValue({
      projectId: "target456",
      queues: ["advance-target456"],
      expectedQueue: "advance-target456",
    });
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved target restart",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.projectId).toBe("target456");
    expect(result.expectedQueue).toBe("advance-target456");
    expect(mockRestartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo/target",
      { approvedLockReclaim: false, approvalEvidence: undefined },
    );
    expect(mockEnsureProjectTemporalQueue).toHaveBeenCalledWith("proj123");
  });

  test("target_path serviceability failure returns bounded failure envelope", async () => {
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    });
    mockRestartCurrentProjectTemporalWorker.mockResolvedValue({
      projectId: "target456",
      queues: ["advance-target456"],
      expectedQueue: "advance-target456",
    });
    // probeTaskQueuePollers defaults to unavailable in beforeEach.

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.errorClass).toBe("WorkerRestartVerificationTimeout");
    expect(result.projectId).toBe("target456");
    expect(result.expectedQueue).toBe("advance-target456");
    expect(result.serviceability).toBeDefined();
    expect(result._freshness).toBeDefined();
    expect(result._projectContext).toBeDefined();
    expect(result.stsl).toBeDefined();
    expect(result.recommendedNextAction).toContain("adv_temporal_diagnose");
  });

  test("target_path requires approval evidence before lock reclaim", async () => {
    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved",
          approvedLockReclaim: true,
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.errorClass).toBe("ApprovalRequired");
    expect(mockRestartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
    expect(mockEnsureProjectTemporalQueue).not.toHaveBeenCalled();
  });

  test("target_path passes lock approval evidence to restart", async () => {
    mockGetService.mockReturnValue({
      client: {},
      connection: { workflowService: { describeTaskQueue: vi.fn() } },
      namespace: "default",
    });
    mockRestartCurrentProjectTemporalWorker.mockResolvedValue({
      projectId: "target456",
      queues: ["advance-target456"],
      expectedQueue: "advance-target456",
    });
    mockProbeTaskQueuePollers.mockResolvedValue({
      status: "fresh",
      lastAccessMs: 1000,
    });

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved",
          approvedLockReclaim: true,
          approvalEvidence: "user approved lock reclaim",
        },
        store,
      ),
    );

    expect(result.success).toBe(true);
    expect(mockRestartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      "/repo/target",
      {
        approvedLockReclaim: true,
        approvalEvidence: "user approved lock reclaim",
      },
    );
  });

  test("target_path source queue preservation failure blocks success", async () => {
    mockRestartCurrentProjectTemporalWorker.mockResolvedValue({
      projectId: "target456",
      queues: ["advance-target456"],
      expectedQueue: "advance-target456",
    });
    mockEnsureProjectTemporalQueue.mockImplementation((projectId) => {
      if (projectId === "proj123") {
        throw new Error("source queue registration failed");
      }
      return undefined;
    });

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        {
          target_path: "/repo/target",
          target_confirmed: true,
          confirmationEvidence: "user approved",
        },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.errorClass).toBe("SourceQueuePreservationFailed");
    expect(result.sourceProjectId).toBe("proj123");
    expect(result.sourceExpectedQueue).toBe("advance-proj123");
    expect(result.sourceQueueError).toContain(
      "source queue registration failed",
    );
    expect(result._projectContext).toBeDefined();
  });

  test("untrusted target_path without confirmation fails before restart", async () => {
    mockResolveTargetProject.mockRejectedValue(
      new Error(
        "Untrusted target_path mutation requires target_confirmed: true and confirmationEvidence",
      ),
    );

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        { target_path: "/repo/target" },
        store,
      ),
    );

    expect(result.success).toBe(false);
    expect(result.errorClass).toBe("TargetProjectError");
    expect(mockRestartCurrentProjectTemporalWorker).not.toHaveBeenCalled();
    expect(mockEnsureProjectTemporalQueue).not.toHaveBeenCalled();
  });

  test("restart without target_path still reaches current project worker", async () => {
    mockRestartCurrentProjectTemporalWorker.mockRejectedValue(
      new Error("current worker restart wedged"),
    );

    const result = parseToolOutput(
      await temporalOpsTools.adv_temporal_worker_restart.execute(
        { approvedLockReclaim: true, approvalEvidence: "user approved" },
        store,
      ),
    );

    expect(mockRestartCurrentProjectTemporalWorker).toHaveBeenCalledWith(
      store.paths.root,
      expect.objectContaining({
        approvedLockReclaim: true,
        approvalEvidence: "user approved",
      }),
    );
    expect(result.success).toBe(false);
  });
});
