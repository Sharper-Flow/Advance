/**
 * status-health-integration-blockers.test.ts
 *
 * TDD RED only — acceptance-level end-to-end tests that prove the three
 * remaining integration blockers for `adv_status view:"health"`:
 *
 *   A) status load → enrichment → specs read sit OUTSIDE a single request-
 *      owned 8s / 7.5s non-composition budget;
 *   B) `listSourceRankedCandidates` has no production caller — ranking
 *      still happens after per-change hydration;
 *   C) `createHealthProbeCache` has no production caller — the bounded
 *      plan still wraps the legacy coalesced `createProbeCache`, so
 *      concurrent same-key forceRefreshes are deduplicated and late /
 *      aborted older publications can clobber newer ones.
 *
 * Tests use real production composition: real `createTemporalStoreBackend`,
 * real `store.status({ recentLimit, deadline })`, real `runHealthStatus`.
 * The Temporal stub only injects delays at boundary edges — it does not
 * mock the resolver path away, and does not precompute top10 candidates
 * before handing the workflow handle to the status pipeline.
 *
 * D) retains the read-only worktree cleanup boundary assertion
 *    (rq-healthReadOnlyWorktree01).
 */

// Bump the tool-output budget so the bounded health response fits inline;
// the production 21,000 char default truncates `changes.recent` to a
// placeholder string in the truncation envelope, hiding the source-ranked
// projection this file asserts on. The bump is purely test-scoped.
process.env.ADV_TOOL_MAX_CHARS = "1000000";

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createTempDir,
  createTestProject,
  cleanupTempDir,
  parseToolOutput,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import { createTemporalStoreBackend } from "../storage/store-temporal";
import type { Store } from "../storage/store";
import { statusTools } from "./status";
import { _statusProbeCaches } from "./status-health";
import { _healthRequestProbeCaches } from "./status-health-plan";
import { createDefaultGates, type Change } from "../types";
import * as worktree from "./worktree";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const {
  mockGetTemporalHealth,
  mockGetWorktreeCensus,
  mockScanSnapshotHealth,
  mockGetPluginRuntimeInfo,
  mockListPeerSessions,
  mockEnumerateAdvWorkerProcesses,
} = vi.hoisted(() => ({
  mockGetTemporalHealth: vi.fn(),
  mockGetWorktreeCensus: vi.fn(),
  mockScanSnapshotHealth: vi.fn(),
  mockGetPluginRuntimeInfo: vi.fn(),
  mockListPeerSessions: vi.fn(),
  mockEnumerateAdvWorkerProcesses: vi.fn(),
}));

const mockSpecsConfig = vi.hoisted(() => ({ delayMs: 0 }));
const mockListConfig = vi.hoisted(() => ({
  delayMs: 0,
  queryCalls: 0,
  listCalls: 0,
}));
const mockProbeConfig = vi.hoisted(() => ({ delayMs: 0 }));

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: (...args: unknown[]) => mockGetTemporalHealth(...args),
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: (...args: unknown[]) => mockGetWorktreeCensus(...args),
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: (...args: unknown[]) => {
    const cfg = mockProbeConfig;
    return (async () => {
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      return mockScanSnapshotHealth(...args);
    })();
  },
}));

vi.mock("../utils/plugin-runtime-info", () => ({
  getPluginRuntimeInfo: (...args: unknown[]) =>
    mockGetPluginRuntimeInfo(...args),
}));

vi.mock("./session/index", () => ({
  listPeerSessions: (...args: unknown[]) => mockListPeerSessions(...args),
}));

vi.mock("../utils/tool-lane-projection", () => ({
  getLaneProjections: vi.fn().mockResolvedValue({}),
  resetLaneProjectionsCache: () => {},
}));

vi.mock("../utils/worker-process-probe", () => ({
  enumerateAdvWorkerProcesses: (...args: unknown[]) =>
    mockEnumerateAdvWorkerProcesses(...args),
  DEFAULT_WORKER_SCRIPT_MARKER: "dist/temporal/worker.js",
}));

vi.mock("../utils/opencode-session-debt", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../utils/opencode-session-debt")>();
  return {
    ...actual,
    scanOpenCodeSessionDebt: vi.fn().mockResolvedValue({
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
    }),
  };
});

vi.mock("../temporal/activities", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../temporal/activities")>();
  return {
    ...actual,
    listSpecsActivity: async (input: any) => {
      if (mockSpecsConfig.delayMs > 0) await sleep(mockSpecsConfig.delayMs);
      return actual.listSpecsActivity(input);
    },
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

function buildTemporalHealth(
  serverAlive: boolean,
  options: { workerAlive?: boolean } = {},
): any {
  return {
    server_alive: serverAlive,
    worker_alive: options.workerAlive ?? false,
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

function createChange(id: string, createdAt: string): Change {
  return {
    $schema: "https://advance.dev/schemas/change.v1.json",
    id,
    title: `Change ${id}`,
    status: "draft",
    lifecycleState: "open",
    created_at: createdAt,
    created_by: "test",
    tasks: [],
    deltas: {},
    gates: createDefaultGates(),
    reentry_history: [],
    wisdom: [],
  } as Change;
}

function buildWorkflowState(id: string, createdAt: string): any {
  return {
    id,
    changeId: id,
    title: `Change ${id}`,
    status: "draft",
    lifecycleState: "open",
    createdAt,
    initializedAt: createdAt,
    projectId: "project-1",
    tasks: [],
    deltas: {},
    wisdom: [],
    gates: createDefaultGates(),
    reentry_history: [],
    artifacts: {},
    documents: {},
    reflections: [],
    worktrees: {},
    conformance: { lockedSpecs: [], overrides: [] },
    worktree_auto_managed: false,
  };
}

interface VisibilityRecord {
  id: string;
  lastSignalAt?: string;
  createdAt?: string;
}

function makeTemporalClient(options: {
  listRecords?: VisibilityRecord[];
  listDelayMs?: number;
  queryDelayMs?: number;
}) {
  return {
    client: {
      workflow: {
        getHandle: (workflowId: string) => ({
          query: async () => {
            mockListConfig.queryCalls++;
            if (options.queryDelayMs) await sleep(options.queryDelayMs);
            const id = workflowId.split("/").pop() ?? workflowId;
            const record = options.listRecords?.find((r) => r.id === id);
            return buildWorkflowState(
              id,
              record?.createdAt ?? "2026-01-01T00:00:00.000Z",
            );
          },
        }),
        list: async function* () {
          mockListConfig.listCalls++;
          if (mockListConfig.delayMs > 0) await sleep(mockListConfig.delayMs);
          const prefix = `adv/change/project-1/`;
          for (const r of options.listRecords ?? []) {
            const searchAttributes: Record<string, unknown> = {};
            if (r.lastSignalAt !== undefined) {
              searchAttributes.AdvLastSignalAt = [r.lastSignalAt];
            }
            if (r.createdAt !== undefined) {
              searchAttributes.AdvCreatedAt = [r.createdAt];
            }
            yield {
              workflowId: `${prefix}${r.id}`,
              searchAttributes,
            };
          }
        },
        start: async () => {
          throw new Error("start should not be called");
        },
      },
    },
  };
}

async function setupStores(options: {
  tempDir: string;
  visibilityRecords?: VisibilityRecord[];
  diskOnlyCandidates?: Array<{ id: string; createdAt: string }>;
}) {
  const legacy = await createDiskStore(options.tempDir);
  for (const r of options.visibilityRecords ?? []) {
    await legacy.changes.save(
      createChange(r.id, r.createdAt ?? "2026-01-01T00:00:00.000Z"),
    );
  }
  for (const c of options.diskOnlyCandidates ?? []) {
    await legacy.changes.save(createChange(c.id, c.createdAt));
  }
  const store = createTemporalStoreBackend({
    legacy,
    temporal: makeTemporalClient({ listRecords: options.visibilityRecords }),
    projectId: "project-1",
  });
  return { legacy, store };
}

// Unwrap the truncation envelope when the bounded health response exceeds
// the production 21,000 char budget; otherwise return the parsed JSON as-is.
function parseStatusOutput(result: unknown): any {
  const parsed = parseToolOutput(result as any) as any;
  return parsed?._truncated && parsed.data ? parsed.data : parsed;
}

function resetMocks(): void {
  mockGetTemporalHealth.mockReset();
  mockGetTemporalHealth.mockResolvedValue(buildTemporalHealth(true));

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

  mockGetPluginRuntimeInfo.mockReset();
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

  mockListPeerSessions.mockReset();
  mockListPeerSessions.mockResolvedValue({ sessions: [] });

  mockEnumerateAdvWorkerProcesses.mockReset();
  mockEnumerateAdvWorkerProcesses.mockResolvedValue(null);

  mockSpecsConfig.delayMs = 0;
  mockProbeConfig.delayMs = 0;
  mockListConfig.delayMs = 0;
  mockListConfig.queryCalls = 0;
  mockListConfig.listCalls = 0;
}

// =============================================================================
// A) status load → enrichment → specs read sit OUTSIDE the bounded plan.
// =============================================================================

describe("A: whole health request budget spans every status→probe→specs path", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    _statusProbeCaches.clear();
    _healthRequestProbeCaches.clear();
    resetMocks();
  }, 15_000);

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("A.1: delayed status resolver + probe + specs read returns within the 8,000 ms wall-clock budget", async () => {
    mockListConfig.delayMs = 6_000;
    mockProbeConfig.delayMs = 6_000;
    mockSpecsConfig.delayMs = 6_000;

    ({ store } = await setupStores({ tempDir }));

    const start = Date.now();
    const result = await statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    const elapsed = Date.now() - start;
    const parsed = parseStatusOutput(result);

    // Whole-request budget respected — even with a 6 s delay on every
    // boundary. In current production this fails because specs.list
    // happens AFTER runHealthStatus returns, with no shared deadline.
    expect(elapsed).toBeLessThanOrEqual(8_100);
    expect(parsed._health_execution).toBeDefined();
    expect(parsed._health_execution.elapsed_ms).toBeLessThanOrEqual(8_000);
  }, 15_000);

  test("A.2: no post-cutoff new work is started after admission closes", async () => {
    // After the 7,500 ms non-composition cutoff, no additional provider
    // fetch may begin. In current production, `store.specs.list()` is
    // invoked AFTER `runHealthStatus()` returns and is not gated by the
    // cutoff.
    mockListConfig.delayMs = 6_000;
    mockProbeConfig.delayMs = 6_000;
    mockSpecsConfig.delayMs = 6_000;

    ({ store } = await setupStores({ tempDir }));

    const realStart = Date.now();
    let specsCallsAfterCutoff = 0;
    let probeCallsAfterCutoff = 0;

    mockScanSnapshotHealth.mockImplementation(async () => {
      if (Date.now() - realStart > 7_500) {
        probeCallsAfterCutoff++;
      }
      await sleep(6_000);
      return buildSnapshotHealthResult();
    });

    const realListSpecsActivity = (await import("../temporal/activities"))
      .listSpecsActivity;
    store.specs.list = vi.fn(async (filter?: any) => {
      if (Date.now() - realStart > 7_500) {
        specsCallsAfterCutoff++;
      }
      return realListSpecsActivity({
        specsDir: store.paths.specs,
        filter,
      });
    }) as unknown as typeof store.specs.list;

    await statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );

    expect(specsCallsAfterCutoff).toBe(0);
    expect(probeCallsAfterCutoff).toBe(0);
  }, 15_000);

  test("A.3: spec read surface produces typed degradation evidence in _health_execution", async () => {
    // When the specs read boundary stalls, the bounded plan must surface a
    // typed partial outcome for it. In current production the specs read
    // lives outside the plan and produces no per-source outcome at all.
    mockListConfig.delayMs = 0;
    mockProbeConfig.delayMs = 0;
    mockSpecsConfig.delayMs = 6_000;

    ({ store } = await setupStores({ tempDir }));

    const result = await statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    const parsed = parseStatusOutput(result);

    expect(parsed._health_execution).toBeDefined();
    expect(parsed._health_execution.outcomes).toBeDefined();

    // The plan must own the spec read so a delay surfaces as typed
    // degradation rather than as a runaway post-plan call.
    const specsOutcome =
      parsed._health_execution.outcomes.spec_requirement_count;
    expect(specsOutcome).toBeDefined();
    expect([
      "ok",
      "stale",
      "timeout",
      "error",
      "unavailable",
      "not_admitted",
    ]).toContain(specsOutcome.kind);
    expect(specsOutcome.elapsed_ms).toBeLessThanOrEqual(8_000);
  }, 15_000);
});

// =============================================================================
// B) `listSourceRankedCandidates` has no production caller.
// =============================================================================

describe("B: source-ranked orientation bounds hydration to global top10", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    _statusProbeCaches.clear();
    _healthRequestProbeCaches.clear();
    resetMocks();
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("B.1: scrambled Visibility + disk-only descriptors hydrate only the globally newest 10", async () => {
    // 15 visibility candidates with deliberately scrambled enumeration
    // order and 5 disk-only candidates newer than every visibility entry.
    const visibilityRecords: VisibilityRecord[] = [
      {
        id: "change-01",
        lastSignalAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "change-03",
        lastSignalAt: "2026-01-03T00:00:00.000Z",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "change-05",
        lastSignalAt: "2026-01-05T00:00:00.000Z",
        createdAt: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "change-07",
        lastSignalAt: "2026-01-07T00:00:00.000Z",
        createdAt: "2026-01-07T00:00:00.000Z",
      },
      {
        id: "change-09",
        lastSignalAt: "2026-01-09T00:00:00.000Z",
        createdAt: "2026-01-09T00:00:00.000Z",
      },
      {
        id: "change-11",
        lastSignalAt: "2026-01-11T00:00:00.000Z",
        createdAt: "2026-01-11T00:00:00.000Z",
      },
      {
        id: "change-13",
        lastSignalAt: "2026-01-13T00:00:00.000Z",
        createdAt: "2026-01-13T00:00:00.000Z",
      },
      {
        id: "change-15",
        lastSignalAt: "2026-01-15T00:00:00.000Z",
        createdAt: "2026-01-15T00:00:00.000Z",
      },
      {
        id: "change-02",
        lastSignalAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "change-04",
        lastSignalAt: "2026-01-04T00:00:00.000Z",
        createdAt: "2026-01-04T00:00:00.000Z",
      },
      {
        id: "change-06",
        lastSignalAt: "2026-01-06T00:00:00.000Z",
        createdAt: "2026-01-06T00:00:00.000Z",
      },
      {
        id: "change-08",
        lastSignalAt: "2026-01-08T00:00:00.000Z",
        createdAt: "2026-01-08T00:00:00.000Z",
      },
      {
        id: "change-10",
        lastSignalAt: "2026-01-10T00:00:00.000Z",
        createdAt: "2026-01-10T00:00:00.000Z",
      },
      {
        id: "change-12",
        lastSignalAt: "2026-01-12T00:00:00.000Z",
        createdAt: "2026-01-12T00:00:00.000Z",
      },
      {
        id: "change-14",
        lastSignalAt: "2026-01-14T00:00:00.000Z",
        createdAt: "2026-01-14T00:00:00.000Z",
      },
    ];

    const diskOnlyCandidates = [
      { id: "change-16", createdAt: "2026-01-16T00:00:00.000Z" },
      { id: "change-17", createdAt: "2026-01-17T00:00:00.000Z" },
      { id: "change-18", createdAt: "2026-01-18T00:00:00.000Z" },
      { id: "change-19", createdAt: "2026-01-19T00:00:00.000Z" },
      { id: "change-20", createdAt: "2026-01-20T00:00:00.000Z" },
    ];

    ({ store } = await setupStores({
      tempDir,
      visibilityRecords,
      diskOnlyCandidates,
    }));

    mockListConfig.queryCalls = 0;

    const status = await store.status({
      recentLimit: 10,
      sourceRanked: true,
    });

    const expectedTop10 = [
      "change-20",
      "change-19",
      "change-18",
      "change-17",
      "change-16",
      "change-15",
      "change-14",
      "change-13",
      "change-12",
      "change-11",
    ];

    const recentIds = status.changes.recent.map((c: any) => c.id);
    expect(recentIds).toEqual(expectedTop10);

    expect(status.hydrationStats?.boundedOmitted).toBe(10);

    // Hydration must be bounded to the admitted set; the omitted
    // candidates must NOT have driven a Temporal query round-trip.
    expect(mockListConfig.queryCalls).toBeLessThanOrEqual(10);
  });

  test("B.2: missing or invalid source-backed timestamps surface as typed omissions", async () => {
    // 8 visibility candidates with valid AdvLastSignalAt + 4 visibility
    // candidates with intentionally missing timestamps + 8 disk-only
    // candidates newer than every visibility entry. The 10 newest
    // source-backed timestamps are admitted; defective candidates must
    // surface as typed omissions, not silently treated as recency.
    const visibilityRecords: VisibilityRecord[] = [
      {
        id: "change-01",
        lastSignalAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "change-02",
        lastSignalAt: "2026-01-02T00:00:00.000Z",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "change-03",
        lastSignalAt: "2026-01-03T00:00:00.000Z",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
      {
        id: "change-04",
        lastSignalAt: "2026-01-04T00:00:00.000Z",
        createdAt: "2026-01-04T00:00:00.000Z",
      },
      {
        id: "change-05",
        lastSignalAt: "2026-01-05T00:00:00.000Z",
        createdAt: "2026-01-05T00:00:00.000Z",
      },
      {
        id: "change-06",
        lastSignalAt: "2026-01-06T00:00:00.000Z",
        createdAt: "2026-01-06T00:00:00.000Z",
      },
      {
        id: "change-07",
        lastSignalAt: "2026-01-07T00:00:00.000Z",
        createdAt: "2026-01-07T00:00:00.000Z",
      },
      {
        id: "change-08",
        lastSignalAt: "2026-01-08T00:00:00.000Z",
        createdAt: "2026-01-08T00:00:00.000Z",
      },
      // 4 defective candidates — AdvLastSignalAt deliberately absent.
      { id: "change-09" },
      { id: "change-10" },
      { id: "change-11" },
      { id: "change-12" },
    ];

    const diskOnlyCandidates = Array.from({ length: 8 }).map((_, i) => {
      const day = 21 + i;
      return {
        id: `change-${day.toString().padStart(2, "0")}`,
        createdAt: `2026-01-${day}T00:00:00.000Z`,
      };
    });

    ({ store } = await setupStores({
      tempDir,
      visibilityRecords,
      diskOnlyCandidates,
    }));

    const status = await store.status({
      recentLimit: 10,
      sourceRanked: true,
    });

    expect(status.changes.recent).toHaveLength(10);
    expect(status.hydrationStats?.boundedOmitted).toBeGreaterThanOrEqual(4);

    // Typed degradation: defective candidates must NOT be silently treated
    // as recency. Source ranking surface must include explicit evidence.
    const rankingEvidence = status.warnings;

    expect(rankingEvidence).toBeDefined();

    const evidenceText = JSON.stringify(rankingEvidence);
    const defectiveIds = ["change-09", "change-10", "change-11", "change-12"];
    const surfacedDefectives = defectiveIds.filter((id) =>
      evidenceText.includes(id),
    );
    expect(surfacedDefectives.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// C) `createHealthProbeCache` has no production caller.
// =============================================================================

describe("C: concurrent same-key health forceRefresh is request-owned", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    _statusProbeCaches.clear();
    _healthRequestProbeCaches.clear();
    resetMocks();
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("C.1: two concurrent same-key forceRefresh requests do not coalesce", async () => {
    const resolvers: Array<(value: any) => void> = [];
    let callCount = 0;
    mockGetTemporalHealth.mockImplementation(async () => {
      const idx = callCount++;
      return new Promise((resolve) => {
        resolvers[idx] = resolve;
      });
    });

    ({ store } = await setupStores({ tempDir }));

    const p1 = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    const p2 = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );

    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[0]?.(buildTemporalHealth(true, { workerAlive: false }));
    resolvers[1]?.(buildTemporalHealth(true, { workerAlive: true }));

    const [r1, r2] = await Promise.all([p1, p2]);
    const p1Parsed = parseStatusOutput(r1);
    const p2Parsed = parseStatusOutput(r2);

    expect(mockGetTemporalHealth).toHaveBeenCalledTimes(2);

    expect(
      [
        p1Parsed.temporal_health.worker_alive,
        p2Parsed.temporal_health.worker_alive,
      ].sort(),
    ).toEqual([false, true]);

    const r3 = await statusTools.adv_status.execute({ view: "health" }, store);
    const parsed3 = parseStatusOutput(r3);
    expect(parsed3.temporal_health.worker_alive).toBe(true);
  });

  test("C.2: late-resolving older request cannot overwrite a newer publication", async () => {
    const resolvers: Array<(value: any) => void> = [];
    let callCount = 0;
    mockGetTemporalHealth.mockImplementation(async () => {
      const idx = callCount++;
      return new Promise((resolve) => {
        resolvers[idx] = resolve;
      });
    });

    ({ store } = await setupStores({ tempDir }));

    const p1 = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );
    const p2 = statusTools.adv_status.execute(
      { view: "health", forceRefresh: true },
      store,
    );

    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1]?.(buildTemporalHealth(true, { workerAlive: true }));
    await sleep(0);

    resolvers[0]?.(buildTemporalHealth(true, { workerAlive: false }));
    await Promise.all([p1, p2]);

    const r3 = await statusTools.adv_status.execute({ view: "health" }, store);
    const parsed3 = parseStatusOutput(r3);
    expect(parsed3.temporal_health.worker_alive).toBe(true);
  });
});

// =============================================================================
// D) Read-only worktree cleanup boundary (retained).
// =============================================================================

describe("D: read-only worktree cleanup boundary", () => {
  let tempDir: string;
  let store: Store;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: false, withSpecs: true });
    _statusProbeCaches.clear();
    _healthRequestProbeCaches.clear();
    resetMocks();
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("D.1: health view does not invoke destructive advWorktreeCleanup", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as any);

    ({ store } = await setupStores({ tempDir }));

    await statusTools.adv_status.execute({ view: "health" }, store);

    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  test("D.2: health view does not delete worktree directories or branches", async () => {
    const cleanupSpy = vi
      .spyOn(worktree, "advWorktreeCleanup")
      .mockResolvedValue({ total: 0, classes: {} } as any);

    ({ store } = await setupStores({ tempDir }));

    await statusTools.adv_status.execute({ view: "health" }, store);
    const result = await statusTools.adv_status.execute(
      { view: "health" },
      store,
    );
    const parsed = parseStatusOutput(result);

    expect(cleanupSpy).not.toHaveBeenCalled();
    expect(parsed.terminal_cleanup_retained).toBeDefined();
    // No mutation markers in the diagnostic projection.
    expect(
      JSON.stringify(parsed.terminal_cleanup_retained).match(
        /drained|deleted/i,
      ),
    ).toBeNull();
  });
});
