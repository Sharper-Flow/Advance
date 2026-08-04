/**
 * RED reproduction for the adv_status host safety-net timeout.
 *
 * This keeps the production composition intact: createToolMap binds the real
 * adv_status implementation through the real safeExecute wrapper, while the
 * Temporal client and probe/spec boundaries are deterministic test fixtures.
 * No real Temporal service or ambient project state is used.
 */

process.env.ADV_TOOL_MAX_CHARS = "1000000";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  cleanupTempDir,
  createTempDir,
  createTestProject,
  parseToolOutput,
  SAMPLE_CHANGE,
} from "../__tests__/setup";
import { createDiskStore } from "../storage/store-disk";
import { createTemporalStoreBackend } from "../storage/store-temporal";
import type { Store } from "../storage/store";
import { createMockOwnerFromClient } from "../temporal/__tests__/mock-owner";
import { createToolMap } from "../tool-registry";

const PROJECT_ID = "0000000000000000000000000000000000000000";
const VIEWS = ["summary", "health", "changes", "hygiene"] as const;
const BOUNDARY_DELAY_MS = 6_000;

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
const mockListConfig = vi.hoisted(() => ({ delayMs: 0 }));
const mockProbeConfig = vi.hoisted(() => ({ delayMs: 0 }));
const { archiveLoadChangeCalls, sourceRankedProjectionReads } = vi.hoisted(
  () => ({
    archiveLoadChangeCalls: [] as string[],
    sourceRankedProjectionReads: [] as string[],
  }),
);

vi.mock("../temporal/health-probe", () => ({
  getTemporalHealth: (...args: unknown[]) => mockGetTemporalHealth(...args),
  isWorkerAffirmativelyAlive: (worker: {
    status: "available" | "unavailable";
    value?: boolean;
  }) => worker.status === "available" && worker.value === true,
}));

vi.mock("../utils/worktree-census", () => ({
  getWorktreeCensus: (...args: unknown[]) => mockGetWorktreeCensus(...args),
}));

vi.mock("./snapshot-scan", () => ({
  scanSnapshotHealth: (...args: unknown[]) => {
    return (async () => {
      if (mockProbeConfig.delayMs > 0) await sleep(mockProbeConfig.delayMs);
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

vi.mock("../storage/change-projection-reader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../storage/change-projection-reader")
    >();
  return {
    ...actual,
    loadChange: async (root: string, id: string) => {
      if (root.includes("/.adv/archive")) {
        archiveLoadChangeCalls.push(id);
      }
      return actual.loadChange(root, id);
    },
    readBoundedProjectionDocument: async (filePath: string, limit?: number) => {
      if (
        filePath.includes("/.adv/changes/") &&
        filePath.endsWith("/change.json")
      ) {
        sourceRankedProjectionReads.push(filePath);
      }
      return actual.readBoundedProjectionDocument(filePath, limit);
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
    resolveRepoRoot: vi.fn().mockReturnValue(null),
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

function buildTemporalHealth(): any {
  return {
    server_alive: true,
    worker_alive: { status: "available", value: false },
    worker_process_alive: { status: "available", value: false },
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

function makeTemporalClient() {
  return {
    client: {
      workflow: {
        getHandle: (workflowId: string) => ({
          query: async () => {
            return {
              id: workflowId.split("/").pop() ?? workflowId,
              changeId: workflowId.split("/").pop() ?? workflowId,
              title: "fixture",
              status: "draft",
              lifecycleState: "open",
              createdAt: "2026-01-01T00:00:00.000Z",
              initializedAt: "2026-01-01T00:00:00.000Z",
              projectId: PROJECT_ID,
              tasks: [],
              deltas: {},
              wisdom: [],
              gates: {},
              reentry_history: [],
              artifacts: {},
              documents: {},
              reflections: [],
              worktrees: {},
              conformance: { lockedSpecs: [], overrides: [] },
              worktree_auto_managed: false,
            };
          },
        }),
        list: async function* () {
          if (mockListConfig.delayMs > 0) await sleep(mockListConfig.delayMs);
          yield {
            workflowId: `adv/change/${PROJECT_ID}/addFeature`,
            searchAttributes: {
              AdvCreatedAt: ["2026-01-01T00:00:00.000Z"],
              AdvLastSignalAt: ["2026-01-01T00:00:00.000Z"],
            },
          };
        },
        start: async () => {
          throw new Error("start should not be called by a status read");
        },
      },
    },
  };
}

async function setupStore(tempDir: string): Promise<Store> {
  const legacy = await createDiskStore(tempDir);
  const store = createTemporalStoreBackend({
    legacy,
    temporal: createMockOwnerFromClient(makeTemporalClient()),
    projectId: PROJECT_ID,
  });
  const realStatus = store.status.bind(store);
  store.status = async (options) => {
    await sleep(BOUNDARY_DELAY_MS);
    return realStatus(options);
  };
  const realSpecsList = store.specs.list.bind(store.specs);
  store.specs.list = async (filter) => {
    await sleep(BOUNDARY_DELAY_MS);
    return realSpecsList(filter);
  };
  return store;
}

const ARCHIVED_CORPUS_SIZE = 480;
const ACTIVE_CORPUS_SIZE = 36;

function corpusChange(
  id: string,
  status: "draft" | "archived",
  index: number,
): object {
  const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString();
  return {
    ...SAMPLE_CHANGE,
    id,
    title: `${status} corpus ${id}`,
    status,
    created_at: timestamp,
    lastSignalAt: timestamp,
    tasks: [],
    deltas: {},
  };
}

async function setupCorpusStore(tempDir: string): Promise<Store> {
  const legacy = await createDiskStore(tempDir);
  if (!legacy.paths.archive) {
    throw new Error("Corpus fixture requires an archive path");
  }

  const writeCorpusChange = async (
    root: string,
    id: string,
    status: "draft" | "archived",
    index: number,
  ): Promise<void> => {
    const changeDir = join(root, id);
    await mkdir(changeDir, { recursive: true });
    await writeFile(
      join(changeDir, "change.json"),
      JSON.stringify(corpusChange(id, status, index)),
    );
  };

  await Promise.all([
    ...Array.from({ length: ARCHIVED_CORPUS_SIZE }, (_, index) =>
      writeCorpusChange(
        legacy.paths.archive!,
        `archived${String(index).padStart(3, "0")}`,
        "archived",
        index,
      ),
    ),
    ...Array.from({ length: ACTIVE_CORPUS_SIZE }, (_, index) =>
      writeCorpusChange(
        legacy.paths.changes,
        `active${String(index).padStart(2, "0")}`,
        "draft",
        ARCHIVED_CORPUS_SIZE + index,
      ),
    ),
  ]);

  return createTemporalStoreBackend({
    legacy,
    temporal: createMockOwnerFromClient(makeTemporalClient()),
    projectId: PROJECT_ID,
  });
}

function resetMocks(): void {
  mockGetTemporalHealth.mockReset();
  mockGetTemporalHealth.mockResolvedValue(buildTemporalHealth());
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
  mockListConfig.delayMs = 0;
  mockProbeConfig.delayMs = 0;
  archiveLoadChangeCalls.length = 0;
  sourceRankedProjectionReads.length = 0;
}

function parseBoundToolResult(result: unknown): any {
  const output =
    typeof result === "string"
      ? result
      : result && typeof result === "object" && "output" in result
        ? (result as { output: string }).output
        : JSON.stringify(result);
  return parseToolOutput(output) as any;
}

describe("adv_status host-cap breach across every view", () => {
  let tempDir: string;
  let store: Store | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: true, withSpecs: true });
    resetMocks();
  }, 15_000);

  afterEach(async () => {
    // safeExecute deliberately cannot cancel an in-flight body after the
    // host-cap response. Let the deterministic fixture settle before cleanup.
    await sleep(2_000);
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test.each(VIEWS)(
    "%s must return complete or typed degraded data before the 10s host cap",
    async (view) => {
      mockListConfig.delayMs = BOUNDARY_DELAY_MS;
      mockSpecsConfig.delayMs = BOUNDARY_DELAY_MS;
      mockProbeConfig.delayMs = BOUNDARY_DELAY_MS;
      store = await setupStore(tempDir);

      const toolMap = createToolMap(store, tempDir, store.paths.agenda) as {
        adv_status: {
          execute: (args: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const startedAt = Date.now();
      const result = await toolMap.adv_status.execute({
        view,
        forceRefresh: true,
      });
      const elapsedMs = Date.now() - startedAt;
      const parsed = parseBoundToolResult(result);

      // RED: current production reaches safeExecute's 10,000ms ceiling and
      // returns this unclassified whole-tool timeout instead of typed
      // degraded status data. The assertion is intentionally expected to
      // fail until the later implementation task fixes the request budget.
      expect(elapsedMs).toBeLessThanOrEqual(10_100);
      expect(parsed.errorClass).not.toBe("ToolExecutionTimeout");
    },
    20_000,
  );
});

describe("adv_status corpus-pressure mechanisms", () => {
  let tempDir: string;
  let store: Store | undefined;

  beforeEach(async () => {
    tempDir = await createTempDir();
    await createTestProject(tempDir, { withChanges: true, withSpecs: true });
    resetMocks();
  });

  afterEach(async () => {
    store?.close();
    await cleanupTempDir(tempDir);
  });

  test("summary, changes, and hygiene do not parse the archive corpus", async () => {
    store = await setupCorpusStore(tempDir);
    const archiveParseCounts: Record<string, number> = {};

    for (const view of ["summary", "changes", "hygiene"] as const) {
      archiveLoadChangeCalls.length = 0;
      await store.status(view === "summary" ? { recentLimit: 10 } : undefined);
      archiveParseCounts[view] = archiveLoadChangeCalls.length;
    }

    // RED: current production loads every archived change even when terminal
    // statuses are not requested. The implementation task must make all three
    // routine status views avoid this work entirely.
    expect(archiveParseCounts).toEqual({ summary: 0, changes: 0, hygiene: 0 });
  }, 20_000);

  test("health source ranking reads no more than the candidate limit", async () => {
    store = await setupCorpusStore(tempDir);
    sourceRankedProjectionReads.length = 0;

    await store.status({
      recentLimit: 10,
      sourceRanked: true,
    });

    // RED: current production reads every active disk candidate before applying
    // candidateLimit. This must remain a mechanism count, not a wall-clock test.
    expect(sourceRankedProjectionReads.length).toBeLessThanOrEqual(10);
  }, 20_000);
});
