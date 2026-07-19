/**
 * status-health-pressure.test.ts
 *
 * TDD RED integration tests for the bounded health execution plan.
 *
 * These tests assert the end-to-end contract that health view will satisfy
 * once it is routed through the request-local HealthExecutionPlan. They are
 * expected to fail in the red phase because production has not yet integrated
 * the new executor, orientation, or deadline wiring.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { statusTools } from "./status";
import { _statusProbeCaches } from "./status-health";
import { _healthRequestProbeCaches } from "./status-health-plan";
import {
  createTestProject,
  createTempDir,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createLegacyStore } from "../storage/store";
import type { Store } from "../storage/store";
import type { ProjectStatus } from "../types";
import * as worktree from "./worktree";

const {
  mockGetTemporalHealth,
  mockGetWorktreeCensus,
  mockScanSnapshotHealth,
  mockScanOpenCodeSessionDebt,
  mockGetPluginRuntimeInfo,
  mockListPeerSessions,
} = vi.hoisted(() => ({
  mockGetTemporalHealth: vi.fn(),
  mockGetWorktreeCensus: vi.fn(),
  mockScanSnapshotHealth: vi.fn(),
  mockScanOpenCodeSessionDebt: vi.fn(),
  mockGetPluginRuntimeInfo: vi.fn(),
  mockListPeerSessions: vi.fn(),
}));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: mockGetTemporalHealth,
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: mockGetWorktreeCensus,
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: mockScanSnapshotHealth,
}));

vi.mock("../utils/opencode-session-debt", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/opencode-session-debt")>();
  return { ...actual, scanOpenCodeSessionDebt: mockScanOpenCodeSessionDebt };
});

vi.mock("../utils/plugin-runtime-info", () => ({
  getPluginRuntimeInfo: mockGetPluginRuntimeInfo,
}));

vi.mock("./session/index", () => ({
  listPeerSessions: mockListPeerSessions,
}));

vi.mock("./archive-helpers/git-finalize", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./archive-helpers/git-finalize")>();
  return {
    ...actual,
    resolveMainCheckout: vi.fn().mockReturnValue(null),
    detectArchivedMergedBranches: vi
      .fn()
      .mockReturnValue({ status: "ok", branches: [] }),
    detectDefaultBranch: vi
      .fn()
      .mockReturnValue({ branch: "main", source: "local-main" }),
    getCheckedOutChangeBranches: vi.fn().mockReturnValue({
      status: "ok",
      branches: new Set<string>(),
      worktreePaths: {},
    }),
  };
});

vi.mock("../temporal/service", () => ({
  getStslStats: vi.fn().mockReturnValue({
    getServiceCalls: 0,
    newConnections: 0,
    reuseRate: 0,
    reconnectCount: 0,
    reconnectFailureCount: 0,
    opTelemetry: [],
    saVerification: null,
  }),
  isStslInitialized: vi.fn().mockReturnValue(false),
  getService: vi.fn().mockReturnValue(null),
  getTemporalWorkerAliveness: vi.fn().mockReturnValue(false),
  getTemporalWorkerDiagnostics: vi.fn().mockReturnValue([]),
}));

function buildTemporalHealth(serverAlive: boolean): any {
  return {
    server_alive: serverAlive,
    worker_alive: false,
    worker_process_alive: false,
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
}

function buildStatusWithFiftySevenCandidates(): ProjectStatus {
  const all: ProjectStatus["changes"]["recent"] = [];
  for (let i = 1; i <= 57; i++) {
    const day = (i % 28) + 1;
    const hour = (i % 24).toString().padStart(2, "0");
    const id = `change-${i.toString().padStart(3, "0")}`;
    all.push({
      id,
      title: `Change ${i}`,
      status: "draft",
      completedTasks: 0,
      taskCount: 0,
      lastActivityAt: `2026-02-${day.toString().padStart(2, "0")}T${hour}:00:00.000Z`,
      minutesSinceActivity: 1000 - i,
    });
  }
  // Deterministic shuffle: reverse the globally newest IDs so the test proves
  // source-ranking, not enumeration order.
  const shuffled = [...all].reverse();
  const topTen = shuffled
    .slice()
    .sort(
      (a, b) =>
        b.lastActivityAt.localeCompare(a.lastActivityAt) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 10);
  const omitted = all.filter((c) => !topTen.some((t) => t.id === c.id));
  return {
    specs: { count: 1, capabilities: [] },
    changes: {
      active: topTen.length,
      byStatus: { draft: topTen.length, archived: 0, closed: 0 },
      recent: topTen,
    },
    recommendations: [],
    resolvedChanges: new Map(),
    warnings: [],
    hydrationStats: {
      boundedOmitted: omitted.length,
    },
  } as unknown as ProjectStatus;
}

function buildSnapshotHealthResult(): any {
  return {
    schema_version: 1,
    scan_duration_ms: 0,
    scope: "project",
    project_id: "unknown",
    summary: {
      projects_scanned: 0,
      bare_repos_scanned: 0,
      critical: 0,
      warnings: 0,
      info: 0,
    },
    findings: [],
  };
}

describe("health view bounded pressure contract", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir);
    store = await createLegacyStore(tempDir);

    mockGetTemporalHealth.mockReset();
    mockGetTemporalHealth.mockResolvedValue(buildTemporalHealth(true));

    _statusProbeCaches.clear();
    _healthRequestProbeCaches.clear();

    mockGetWorktreeCensus.mockReset();
    mockGetWorktreeCensus.mockResolvedValue({
      total: 0,
      stale: [],
      records: [],
      warnings: [],
      classes: {},
    });

    mockScanSnapshotHealth.mockReset();
    mockScanSnapshotHealth.mockResolvedValue(buildSnapshotHealthResult());

    mockScanOpenCodeSessionDebt.mockResolvedValue({
      available: false,
      db_path: "/missing/opencode.db",
      checked_at: "2026-05-02T02:30:00.000Z",
      reason: "not found",
      threshold_ms: 300_000,
      total_blank: 0,
      repairable_stale: [],
      live_in_flight: [],
      idle_active_session: [],
      orphan_ghost: [],
      ignored_with_parts: [],
    });

    mockGetPluginRuntimeInfo.mockResolvedValue({
      loaded_module_path: "/test/dist/index.js",
      process_started_at: "2026-01-01T00:00:00.000Z",
      build_marker_path: "/test/oca-build.json",
      worker_script_path: "/test/worker.js",
      reload_caveat: "Restart OpenCode",
      source_dist_freshness: "unknown",
      plugin_bundle_freshness: "unknown",
      plugin_bundle_manifest_path: "/test/plugin-bundle-manifest.json",
      loaded_plugin_generation: "0",
      deployed_plugin_generation: "0",
      plugin_bundle_recovery: null,
    });

    mockListPeerSessions.mockResolvedValue({ sessions: [] });
  });

  afterEach(async () => {
    store.close();
    await cleanupTempDir(tempDir);
  });

  test("health passes 7,500 ms cutoff and candidate limit 10 into authoritative read", async () => {
    const statusSpy = vi.spyOn(store, "status");

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.view).toBe("health");
    expect(statusSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recentLimit: 10,
        deadline: expect.objectContaining({ budgetMs: 7500 }),
      }),
    );
  });

  test("health returns request-local execution metadata with budget and concurrency", async () => {
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed._health_execution).toBeDefined();
    expect(parsed._health_execution.schema_version).toBe("1.0");
    expect(parsed._health_execution.response_deadline_ms).toBe(8000);
    expect(parsed._health_execution.execution_cutoff_ms).toBe(7500);
    expect(parsed._health_execution.composition_reserve_ms).toBe(500);
    expect(parsed._health_execution.max_concurrency).toBe(4);
    expect(parsed._health_execution.candidate_limit).toBe(10);
  });

  test("health with 57 candidates admits only the globally newest 10 and reports omission", async () => {
    const syntheticStatus = buildStatusWithFiftySevenCandidates();
    store.status = vi.fn().mockResolvedValue(syntheticStatus);

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed._health_execution).toBeDefined();
    expect(parsed._health_execution.admitted_count).toBe(10);
    expect(parsed._health_execution.omitted_count).toBe(47);
    expect(parsed._health_execution.omitted_sample).toBeDefined();
    expect(parsed._health_execution.omitted_sample.length).toBeLessThanOrEqual(
      20,
    );
    expect(parsed.changes.recent.length).toBe(10);
  });

  test("health invokes zero advWorktreeCleanup", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as any);

    await statusTools.adv_status.execute({ view: "health" }, store);

    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  test("health still surfaces retained worktree counts and classes without cleanup", async () => {
    mockGetWorktreeCensus.mockResolvedValue({
      total: 5,
      stale: [],
      records: [],
      warnings: [],
      classes: { auto: 3, legacy: 2 },
    });

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed.worktree_census).toBeDefined();
    expect(parsed.worktree_census.total).toBe(5);
    expect(parsed.worktree_census.classes).toMatchObject({
      auto: 3,
      legacy: 2,
    });
  });

  test("hygiene view still runs cleanup discovery and explicit ownership", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as any);

    await statusTools.adv_status.execute({ view: "hygiene" }, store);

    expect(cleanupSpy).toHaveBeenCalled();
  });

  test("queue dependency is not_admitted when temporal health is unavailable", async () => {
    mockGetTemporalHealth.mockResolvedValue(buildTemporalHealth(false));

    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed._health_execution).toBeDefined();
    const queueOutcome =
      parsed._health_execution.outcomes?.temporal_queue_serviceability;
    expect(queueOutcome).toBeDefined();
    expect(queueOutcome.kind).toBe("not_admitted");
    expect(queueOutcome.evidence).toMatch(/temporal/);
  });

  // rq-statusHealthTypedDegradation01: slow or unavailable providers retain
  // completed health output while exposing a typed partial outcome.
  test("cold forceRefresh stalled probes return partial typed outcomes by virtual 8,000 ms", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      store.status = vi.fn().mockResolvedValue({
        specs: { count: 1, capabilities: [] },
        changes: {
          active: 0,
          byStatus: { draft: 0, archived: 0, closed: 0 },
          recent: [],
        },
        recommendations: [],
      });

      mockGetTemporalHealth.mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(buildTemporalHealth(true)), 10_000);
          }),
      );
      mockGetWorktreeCensus.mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(
              () =>
                resolve({
                  total: 0,
                  stale: [],
                  records: [],
                  warnings: [],
                  classes: {},
                }),
              10_000,
            );
          }),
      );
      mockScanSnapshotHealth.mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(buildSnapshotHealthResult()), 10_000);
          }),
      );

      const start = Date.now();
      const executePromise = statusTools.adv_status.execute(
        { view: "health", forceRefresh: true } as any,
        store,
      );
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await executePromise;
      const elapsed = Date.now() - start;
      const parsed = parseToolOutput(result);

      expect(elapsed).toBeLessThanOrEqual(8_100);
      expect(parsed._health_execution).toBeDefined();
      expect(parsed._health_execution.elapsed_ms).toBeLessThanOrEqual(8_000);
      expect(parsed._health_execution.degraded).toBe(true);

      const outcomes = parsed._health_execution.outcomes;
      expect(outcomes).toBeDefined();
      const stalled = Object.values(outcomes).filter(
        (o: any) => o.kind === "timeout" || o.kind === "not_admitted",
      );
      expect(stalled.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("stable source outcome order is preserved regardless of completion order", async () => {
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseToolOutput(result);

    expect(parsed._health_execution).toBeDefined();
    const sources = Object.keys(parsed._health_execution.outcomes);
    expect(sources.length).toBeGreaterThan(0);
    // Expected static descriptor order for health providers. The plan owns
    // reduction order so late/slow providers cannot reorder the output.
    const expectedOrder = [
      "temporal_health",
      "search_attributes",
      "project_config",
      "worker_processes",
      "worktree_census",
      "snapshot_health",
      "peer_sessions",
      "plugin_runtime",
      "terminal_cleanup_retained",
      "migration_status",
      "spec_requirement_count",
      "temporal_queue_serviceability",
    ];
    expect(sources).toEqual(expectedOrder);
  });

  test("no post-cutoff admission or late mutation of returned output", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      store.status = vi.fn().mockResolvedValue({
        specs: { count: 1, capabilities: [] },
        changes: {
          active: 0,
          byStatus: { draft: 0, archived: 0, closed: 0 },
          recent: [],
        },
        recommendations: [],
      });

      mockGetTemporalHealth.mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(buildTemporalHealth(true)), 8_500);
          }),
      );

      const executePromise = statusTools.adv_status.execute(
        { view: "health", forceRefresh: true } as any,
        store,
      );
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await executePromise;
      const parsed = parseToolOutput(result);

      const outcome = parsed._health_execution?.outcomes?.temporal_health;
      expect(outcome).toBeDefined();
      expect(["timeout", "not_admitted"]).toContain(outcome.kind);
      expect(outcome.elapsed_ms).toBeLessThanOrEqual(8_000);
      // Late completion must not have overwritten the outcome or elapsed time.
      expect(parsed._health_execution.meta.elapsed_ms).toBeLessThanOrEqual(
        8_000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("one request deadline owns delayed status, probes, and spec counting", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const baseStatus = await store.status();
      store.status = vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(baseStatus), 7_400);
          }),
      );
      store.specs.list = vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ specs: [] }), 10_000);
          }),
      );

      const start = Date.now();
      const executePromise = statusTools.adv_status.execute(
        { view: "health", forceRefresh: true },
        store,
      );
      await vi.advanceTimersByTimeAsync(8_000);
      const result = await executePromise;
      const parsed = parseToolOutput(result);

      expect(Date.now() - start).toBeLessThanOrEqual(8_000);
      expect(parsed._health_execution.degraded).toBe(true);
      expect(parsed._health_execution.execution_cutoff_ms).toBe(7_500);
      expect(store.specs.list).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("concurrent force refreshes do not share inflight probe publication", async () => {
    let calls = 0;
    let resolveFirst!: (value: any) => void;
    mockGetTemporalHealth.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return { ...buildTemporalHealth(true), request_marker: "newer" };
    });

    const first = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(1));
    const second = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
    resolveFirst({ ...buildTemporalHealth(true), request_marker: "older" });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const firstParsed = parseToolOutput(firstResult);
    const secondParsed = parseToolOutput(secondResult);
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(firstParsed.temporal_health.request_marker).toBe("older");
    expect(secondParsed.temporal_health.request_marker).toBe("newer");
  });

  test("concurrent cold health reads are request-owned rather than coalesced", async () => {
    let calls = 0;
    const resolvers: Array<(value: any) => void> = [];
    mockGetTemporalHealth.mockImplementation(async () => {
      const index = calls++;
      return new Promise((resolve) => {
        resolvers[index] = resolve;
      });
    });

    const first = statusTools.adv_status.execute({ view: "health" }, store);
    const second = statusTools.adv_status.execute({ view: "health" }, store);
    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(2));
    resolvers[1]({ ...buildTemporalHealth(true), request_marker: "newer" });
    resolvers[0]({ ...buildTemporalHealth(true), request_marker: "older" });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    const markers = [
      parseToolOutput(firstResult).temporal_health.request_marker,
      parseToolOutput(secondResult).temporal_health.request_marker,
    ].sort();
    expect(markers).toEqual(["newer", "older"]);
    expect(calls).toBe(2);

    const cached = parseToolOutput(
      await statusTools.adv_status.execute({ view: "health" }, store),
    );
    expect(cached.temporal_health.request_marker).toBe("newer");
  });
});
