/**
 * Multi-queue serviceability test for computeStatusQueueServiceability.
 *
 * Verifies AC6 / rq-isolSessionTaskQueue04.2: when a session ID is
 * available via getCurrentSessionId, `adv_status view:"health"` (via
 * `computeStatusQueueServiceability`) returns a `sessionQueueServiceability`
 * field alongside the existing project-queue `serviceability`. Operators
 * can then distinguish session-queue state from project-queue state.
 *
 * Review fix for tk-bbe046a7783b coverage gap (issue finding from
 * /adv-review scanner bundle).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetTemporalHealth = vi.hoisted(() => vi.fn());
const mockProbeTaskQueuePollers = vi.hoisted(() => vi.fn());
const mockGetCurrentSessionId = vi.hoisted(() => vi.fn(() => undefined));
const mockGetService = vi.hoisted(() => vi.fn(() => null));
const mockGetTemporalWorkerAliveness = vi.hoisted(() => vi.fn(() => false));
const mockGetTemporalWorkerDiagnostics = vi.hoisted(() => vi.fn(() => []));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mockGetTemporalHealth,
}));

vi.mock("../temporal/queue-serviceability", () => ({
  probeTaskQueuePollers: mockProbeTaskQueuePollers,
  classifyQueueServiceability: vi.fn((input: { serverPollerProbe?: { status?: string } }) => ({
    status:
      input.serverPollerProbe?.status === "fresh"
        ? "serviceable"
        : "not_serviceable",
    confidence: "server",
    evidence: { serverPollerProbe: input.serverPollerProbe?.status ?? "unavailable" },
    blockers: [],
  })),
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
  isStslInitialized: vi.fn().mockReturnValue(false),
}));

vi.mock("../plugin-init", () => ({
  getTemporalWorkerAliveness: mockGetTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics: mockGetTemporalWorkerDiagnostics,
  getRegisteredTemporalWorkerQueues: vi.fn(() => []),
}));

vi.mock("../utils/worktree-census", () => ({ getWorktreeCensus: vi.fn() }));
vi.mock("../utils/worker-process-probe", () => ({
  enumerateAdvWorkerProcesses: vi.fn(),
  DEFAULT_WORKER_SCRIPT_MARKER: "dist/temporal/worker.js",
}));
vi.mock("./snapshot-scan", () => ({ scanSnapshotHealth: vi.fn() }));

import { computeStatusQueueServiceability } from "./status-health";

const HEALTH = {
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
} as const;

const BUNDLE = {
  connection: { workflowService: { describeTaskQueue: vi.fn() } },
  namespace: "default",
} as unknown as ReturnType<typeof mockGetService>;

describe("computeStatusQueueServiceability multi-queue (rq-isolSessionTaskQueue04 / AC6)", () => {
  beforeEach(() => {
    mockGetCurrentSessionId.mockReturnValue(undefined);
    mockGetService.mockReturnValue(null);
    mockProbeTaskQueuePollers.mockResolvedValue({ status: "unavailable" });
    mockGetTemporalWorkerAliveness.mockReturnValue(false);
    mockGetTemporalWorkerDiagnostics.mockReturnValue([]);
  });

  it("returns sessionQueueServiceability when getCurrentSessionId is set and bundle is available", async () => {
    mockGetCurrentSessionId.mockReturnValue("sess_StatusHealth1");
    mockGetService.mockReturnValue(BUNDLE);
    mockProbeTaskQueuePollers.mockResolvedValue({ status: "fresh" });

    const result = await computeStatusQueueServiceability({
      projectId: "proj-status-test-001",
      health: { ...HEALTH },
    });

    expect(result).not.toBeNull();
    expect(result?.sessionQueue).toBe(
      "advance-proj-status-test-001-sess_StatusHealth1",
    );
    expect(result?.sessionQueueServiceability).toBeDefined();
    expect(result?.sessionQueueServiceability?.status).toBe("serviceable");
    // Project queue still probed alongside
    expect(result?.expectedQueue).toBe("advance-proj-status-test-001");
    expect(result?.serviceability).toBeDefined();
  });

  it("omits sessionQueueServiceability when getCurrentSessionId is undefined (backward compat)", async () => {
    // sessionId unset (default mock state)
    const result = await computeStatusQueueServiceability({
      projectId: "proj-status-test-002",
      health: { ...HEALTH },
    });

    expect(result).not.toBeNull();
    expect(result?.sessionQueue).toBeUndefined();
    expect(result?.sessionQueueServiceability).toBeUndefined();
    expect(result?.expectedQueue).toBe("advance-proj-status-test-002");
  });

  it("exposes sessionQueue name but omits serviceability when bundle is unavailable", async () => {
    mockGetCurrentSessionId.mockReturnValue("sess_NoBundle");
    // bundle stays null (default mock)

    const result = await computeStatusQueueServiceability({
      projectId: "proj-status-test-003",
      health: { ...HEALTH },
    });

    expect(result).not.toBeNull();
    // sessionQueue is still exposed (operator visibility into what
    // session routing would target) even when the probe couldn't run.
    expect(result?.sessionQueue).toBe(
      "advance-proj-status-test-003-sess_NoBundle",
    );
    // Serviceability is omitted because probeTaskQueuePollers needs a
    // service bundle to call describeTaskQueue.
    expect(result?.sessionQueueServiceability).toBeUndefined();
  });
});
