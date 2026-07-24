/**
 * status-health
 *
 * Extracted from status.ts — pure move, no behavior change.
 */

import { basename } from "path";
import type { Store } from "../storage/store";
import {
  buildProjectTaskQueue,
  buildSessionTaskQueue,
} from "../temporal/client";
import { getTemporalHealth } from "../temporal/health-probe";
import { getCurrentSessionId } from "../utils/session-id";
import {
  getOrphanQueueAdoptionDiagnostics,
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
} from "../plugin-init";
import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { getTemporalFallbackTelemetry } from "../temporal/fallback-telemetry";
import {
  getService,
  getStslStats,
  isStslInitialized,
} from "../temporal/service";
import { getWorktreeCensus } from "../utils/worktree-census";
import { enumerateAdvWorkerProcesses } from "../utils/worker-process-probe";
import { listChangeDirs, loadChange } from "../storage/json";
import { archiveBundleExists } from "../archive/archive";
import { createProbeCache, type ProbeCacheFreshness } from "./probe-cache";
import { scanSnapshotHealth } from "./snapshot-scan";
import {
  pushStatusRecommendation,
  type StatusRecommendationCarrier,
} from "./status-enrich";

// =============================================================================
// Health Snapshot Cache
// =============================================================================

export const HEALTH_SNAPSHOT_TTL_MS = 30000;
export const MISSING_PROJECT_ID_CACHE_KEY = "__current_project__";
const STATUS_PROBE_TIMEOUT_MS = 2_000;
export const STATUS_PROBE_TTL_MS = 10_000;

export interface StatusProbeFetchOptions {
  forceRefresh?: boolean;
}

export interface HealthSnapshot {
  leaked_source_dirs: number;
  leaked_archived_source_dirs: number;
  archive_dirs: number;
  closed_to_active_ratio: number;
}
export type TemporalHealthSnapshot = Awaited<
  ReturnType<typeof getTemporalHealth>
>;
export type WorktreeCensusSnapshot = Awaited<
  ReturnType<typeof getWorktreeCensus>
>;

export interface SearchAttributesSnapshot {
  ok: boolean;
  checkedAt?: number;
  error?: string;
}

export interface StatusQueueServiceabilitySnapshot {
  expectedQueue: string;
  serviceability: QueueServiceability;
  workerDiagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>;
  orphanQueueAdoption: {
    enabled: boolean;
    tracked: number;
    inCooldown: number;
  } | null;
  /**
   * Per-session queue serviceability when per-session routing is active
   * (rq-isolSessionTaskQueue04 / AC6). Present only when the current
   * process has a session ID and a session-scoped task queue was probed
   * alongside the permanent project queue. Operators reading
   * `adv_status view:"health"` consume this to distinguish session-queue
   * state from project-queue state — a peer-session wedge may leave the
   * project queue serviceable while the session queue is not.
   */
  sessionQueueServiceability?: QueueServiceability;
  /** The session-scoped queue name when `sessionQueueServiceability` is present. */
  sessionQueue?: string;
}
export const healthSnapshotCache = new Map<
  string,
  { snapshot: HealthSnapshot; computedAt: number }
>();

export const statusTemporalHealthProbeCache = createProbeCache<
  TemporalHealthSnapshot,
  string
>({
  name: "status.temporal_health",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (key, { signal }) =>
    getTemporalHealth(key === MISSING_PROJECT_ID_CACHE_KEY ? undefined : key, {
      signal,
    }),
});

export const statusWorktreeCensusProbeCache = createProbeCache<
  WorktreeCensusSnapshot,
  string
>({
  name: "status.worktree_census",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (root, { signal }) => getWorktreeCensus(root, { signal }),
});

export const statusSearchAttributesProbeCache = createProbeCache<
  SearchAttributesSnapshot,
  string
>({
  name: "status.search_attributes",
  ttlMs: STATUS_PROBE_TTL_MS,
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async () => computeSearchAttributesSnapshot(),
});

export type SnapshotHealthSnapshot = Awaited<
  ReturnType<typeof scanSnapshotHealth>
>;

export const SNAPSHOT_HEALTH_TTL_MS = 60_000;
export const SNAPSHOT_HEALTH_TIMEOUT_MS = 10_000;

export const snapshotHealthProbeCache = createProbeCache<
  SnapshotHealthSnapshot,
  string
>({
  name: "status.snapshot_health",
  ttlMs: SNAPSHOT_HEALTH_TTL_MS,
  timeoutMs: SNAPSHOT_HEALTH_TIMEOUT_MS,
  fetch: async (key) =>
    scanSnapshotHealth({
      scope: "project",
      projectId: key === MISSING_PROJECT_ID_CACHE_KEY ? "unknown" : key,
    }),
});

// =============================================================================
// Worker-processes advisory probe (AC5, fixTemporalTimeoutsWorker)
// =============================================================================

/**
 * Advisory OS-level worker census: live ADV worker process count, orphan
 * count, and per-process pid/ppid/orphan detail. `null` when enumeration is
 * unavailable (non-Linux host, missing /proc) — callers omit the section.
 */
export type WorkerProcessesSnapshot = Awaited<
  ReturnType<typeof enumerateAdvWorkerProcesses>
>;

/** Host-wide census — single cache key (not project-scoped). */
const WORKER_PROCESSES_CACHE_KEY = "__host_workers__";

export const statusWorkerProcessesProbeCache = createProbeCache<
  WorkerProcessesSnapshot,
  string
>({
  name: "status.worker_processes",
  ttlMs: STATUS_PROBE_TTL_MS,
  // /proc enumeration is local and cheap; the standard 2s probe bound
  // guarantees a slow/hung scan can never stall the health probe.
  timeoutMs: STATUS_PROBE_TIMEOUT_MS,
  fetch: async (_key, { signal }) => enumerateAdvWorkerProcesses({ signal }),
});

/** Exported for test isolation only */
export const _statusProbeCaches = {
  clear(): void {
    statusTemporalHealthProbeCache.clear();
    statusWorktreeCensusProbeCache.clear();
    statusSearchAttributesProbeCache.clear();
    snapshotHealthProbeCache.clear();
    statusWorkerProcessesProbeCache.clear();
  },
};

export async function fetchStatusSnapshotHealth(
  projectId: string | undefined,
  options: StatusProbeFetchOptions = {},
): Promise<{
  value: SnapshotHealthSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return snapshotHealthProbeCache.fetch(
    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
    options,
  );
}

/** Clears cache state owned by this module; composed by the test reset owner. */
export function resetStatusHealthModuleForTest(): void {
  healthSnapshotCache.clear();
  _statusProbeCaches.clear();
}

/** Exported for test isolation only */
export const _healthSnapshotCache = healthSnapshotCache;
export function computeSearchAttributesSnapshot(): SearchAttributesSnapshot {
  const stslStats = getStslStats();
  const stslReady = isStslInitialized();
  if (!stslReady) {
    return {
      ok: false,
      error: "STSL not initialized",
    };
  }
  if (stslStats.saVerification) {
    return {
      ok: stslStats.saVerification.ok,
      checkedAt: stslStats.saVerification.checkedAt,
    };
  }
  return { ok: false, error: "Not yet verified" };
}

export async function fetchStatusTemporalHealth(
  projectId: string | undefined,
  options: StatusProbeFetchOptions = {},
): Promise<{
  value: TemporalHealthSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return statusTemporalHealthProbeCache.fetch(
    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
    options,
  );
}

export async function fetchStatusWorkerProcesses(
  options: StatusProbeFetchOptions = {},
): Promise<{
  value: WorkerProcessesSnapshot;
  freshness: ProbeCacheFreshness;
}> {
  return statusWorkerProcessesProbeCache.fetch(
    WORKER_PROCESSES_CACHE_KEY,
    options,
  );
}

export async function fetchStatusQueueServiceability(
  input: {
    projectId: string | undefined;
    health: TemporalHealthSnapshot;
  },
  _options: StatusProbeFetchOptions = {},
): Promise<{
  value: StatusQueueServiceabilitySnapshot | null;
  freshness: ProbeCacheFreshness;
}> {
  const value = await computeStatusQueueServiceability(input);
  const cachedAt = Date.now();
  return {
    value,
    freshness: {
      cached_at: new Date(cachedAt).toISOString(),
      stale: false,
      age_ms: 0,
      ttl_ms: STATUS_PROBE_TTL_MS,
    },
  };
}

export async function computeHealthSnapshot(
  store: Store,
): Promise<HealthSnapshot> {
  const cacheKey = store.paths.external
    ? basename(store.paths.external)
    : store.paths.root;

  const cached = healthSnapshotCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.computedAt < HEALTH_SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }

  const changesDir = store.paths.changes;
  const archiveDir = store.paths.archive;

  const [changeIds, archiveIds] = await Promise.all([
    listChangeDirs(changesDir),
    listChangeDirs(archiveDir),
  ]);

  let leakedSourceDirs = 0;
  let leakedArchivedSourceDirs = 0;
  let closedCount = 0;
  let activeCount = 0;

  await Promise.all(
    changeIds.map(async (id) => {
      const result = await loadChange(changesDir, id);
      if (!result.success || !result.data) return;

      const status = result.data.status;
      if (status === "closed") {
        closedCount++;
        const hasArchive = await archiveBundleExists(archiveDir, id);
        if (!hasArchive) {
          leakedSourceDirs++;
        }
      } else if (status === "archived") {
        leakedArchivedSourceDirs++;
      } else if (status === "draft") {
        activeCount++;
      }
    }),
  );

  const snapshot: HealthSnapshot = {
    leaked_source_dirs: leakedSourceDirs,
    leaked_archived_source_dirs: leakedArchivedSourceDirs,
    archive_dirs: archiveIds.length,
    closed_to_active_ratio:
      Math.round((closedCount / Math.max(activeCount, 1)) * 100) / 100,
  };

  healthSnapshotCache.set(cacheKey, { snapshot, computedAt: now });
  return snapshot;
}

export function statusDiagnosticsIncludeQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return worker.queues.some(
      (queue) => queue === expectedQueue && !failed.has(queue),
    );
  });
}

export function statusDiagnosticsShowAliveQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return (
      worker.alive &&
      worker.queues.some(
        (queue) => queue === expectedQueue && !failed.has(queue),
      )
    );
  });
}

export function statusLocalOwnership(
  health: TemporalHealthSnapshot,
): "owned" | "peer" | "unknown" {
  if (!health.worker_lock) return "unknown";
  return health.worker_lock.holder_pid === process.pid ? "owned" : "peer";
}

export async function computeStatusQueueServiceability(input: {
  projectId: string | undefined;
  health: TemporalHealthSnapshot;
}): Promise<StatusQueueServiceabilitySnapshot | null> {
  if (!input.projectId) return null;
  const expectedQueue = buildProjectTaskQueue(input.projectId);
  const workerDiagnostics = getTemporalWorkerDiagnostics();
  const orphanQueueAdoptionDiagnostics = getOrphanQueueAdoptionDiagnostics();
  const orphanQueueAdoption = orphanQueueAdoptionDiagnostics
    ? {
        enabled: true,
        tracked: orphanQueueAdoptionDiagnostics.trackedQueues.length,
        inCooldown: orphanQueueAdoptionDiagnostics.trackedQueues.filter(
          (queue) => queue.inCooldown,
        ).length,
      }
    : null;
  const bundle = getService();
  const serverPollerProbe = bundle
    ? await probeTaskQueuePollers({
        connection: bundle.connection as unknown as Parameters<
          typeof probeTaskQueuePollers
        >[0]["connection"],
        namespace: bundle.namespace,
        taskQueue: expectedQueue,
      })
    : {
        status: "unavailable" as const,
        lastAccessMs: null,
        error: "Temporal service layer not initialized",
      };
  const staleRunningWorkflowCount = input.health.stale_queues
    .filter((queue) => queue.queue === expectedQueue)
    .reduce((total, queue) => total + queue.running_count, 0);
  const localRegistered =
    input.health.registered_queues.includes(expectedQueue) ||
    statusDiagnosticsIncludeQueue(workerDiagnostics, expectedQueue);
  const localWorkerAlive =
    getTemporalWorkerAliveness() ||
    statusDiagnosticsShowAliveQueue(workerDiagnostics, expectedQueue);

  // KD-5 / rq-isolSessionTaskQueue04 / AC6: when per-session routing is
  // active, also probe the session-scoped queue so operators reading
  // `adv_status view:"health"` can distinguish session-queue serviceability
  // from project-queue serviceability. A peer-session wedge may leave the
  // project queue serviceable (peer is polling it) while the session queue
  // has no poller. Without this probe, the status view would mask the
  // wedge — exactly the diagnostic gap AC6 was written to close.
  const sessionId = getCurrentSessionId();
  const sessionQueue = sessionId
    ? buildSessionTaskQueue(input.projectId, sessionId)
    : undefined;
  let sessionQueueServiceability: QueueServiceability | undefined;
  if (bundle && sessionQueue) {
    const sessionPollerProbe = await probeTaskQueuePollers({
      connection: bundle.connection as unknown as Parameters<
        typeof probeTaskQueuePollers
      >[0]["connection"],
      namespace: bundle.namespace,
      taskQueue: sessionQueue,
    });
    const sessionStaleCount = input.health.stale_queues
      .filter((queue) => queue.queue === sessionQueue)
      .reduce((total, queue) => total + queue.running_count, 0);
    const sessionLocalRegistered =
      input.health.registered_queues.includes(sessionQueue) ||
      statusDiagnosticsIncludeQueue(workerDiagnostics, sessionQueue);
    const sessionLocalWorkerAlive =
      getTemporalWorkerAliveness() ||
      statusDiagnosticsShowAliveQueue(workerDiagnostics, sessionQueue);
    sessionQueueServiceability = classifyQueueServiceability({
      projectId: input.projectId,
      expectedQueue: sessionQueue,
      localRegistered: sessionLocalRegistered,
      localWorkerAlive: sessionLocalWorkerAlive,
      localOwnership: statusLocalOwnership(input.health),
      workerDiagnostics,
      serverPollerProbe: sessionPollerProbe,
      staleRunningWorkflowCount: sessionStaleCount,
      staleQueueProbe: input.health.server_alive
        ? input.health.probe_degraded
          ? "degraded"
          : "ok"
        : "unavailable",
    });
  }

  return {
    expectedQueue,
    workerDiagnostics,
    orphanQueueAdoption,
    serviceability: classifyQueueServiceability({
      projectId: input.projectId,
      expectedQueue,
      localRegistered,
      localWorkerAlive,
      localOwnership: statusLocalOwnership(input.health),
      workerDiagnostics,
      serverPollerProbe,
      staleRunningWorkflowCount,
      staleQueueProbe: input.health.server_alive
        ? input.health.probe_degraded
          ? "degraded"
          : "ok"
        : "unavailable",
    }),
    ...(sessionQueue ? { sessionQueue, sessionQueueServiceability } : {}),
  };
}
function isProbeTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TimeoutError") return true;
  if (err.cause instanceof Error && err.cause.name === "TimeoutError") {
    return true;
  }
  return /timed out/i.test(err.message);
}

/** Fallback TemporalHealthSnapshot used when the health probe throws. */
export function buildTemporalHealthFallback(
  err: unknown,
): TemporalHealthSnapshot {
  if (isProbeTimeoutError(err)) {
    return {
      server_alive: true,
      worker_alive: true,
      worker_process_alive: true,
      registered_queues: [],
      last_op_at: null,
      last_error: err instanceof Error ? err.message : String(err),
      fallback_counts: { ...getTemporalFallbackTelemetry() },
      stale_queues: [],
      reconnect_count: 0,
      op_counters: [],
      worker_lock: null,
      last_worker_run_error: null,
      probe_degraded: true,
    };
  }
  return {
    server_alive: false,
    worker_alive: false,
    worker_process_alive: false,
    registered_queues: [],
    last_op_at: null,
    last_error: err instanceof Error ? err.message : String(err),
    fallback_counts: { ...getTemporalFallbackTelemetry() },
    stale_queues: [],
    reconnect_count: 0,
    op_counters: [],
    worker_lock: null,
    last_worker_run_error: null,
  };
}

/**
 * Append queue-serviceability recommendations (stale-queue warnings + suspect
 * v1 worker.lock). Mutates `status.recommendations` in place so ordering
 * relative to the other probes is preserved exactly.
 */
export function pushQueueServiceabilityRecommendations(input: {
  status: StatusRecommendationCarrier;
  temporalHealth: TemporalHealthSnapshot;
  queueServiceability: StatusQueueServiceabilitySnapshot | null | undefined;
}): void {
  const { status, temporalHealth, queueServiceability } = input;
  if (temporalHealth.stale_queues.length > 0) {
    const serviceableQueue =
      queueServiceability?.serviceability.status === "serviceable"
        ? queueServiceability.expectedQueue
        : null;
    for (const sq of temporalHealth.stale_queues) {
      if (sq.queue === serviceableQueue) continue;
      const message = `⚠️ Stale Temporal queue \`${sq.queue}\` has ${sq.running_count} Running workflows older than 5 min with no local poller. See docs/temporal-recovery.md § "Stale \`adv/change/*\` and \`adv/project/*\` workflows".`;
      pushStatusRecommendation(status, {
        kind: "health",
        priority: "high",
        title: `Stale Temporal queue \`${sq.queue}\``,
        detail: `${sq.running_count} Running workflow(s) older than 5 min with no local poller`,
        action:
          'See docs/temporal-recovery.md § "Stale `adv/change/*` and `adv/project/*` workflows"',
        source: "health",
        message,
      });
    }
  }
  if (
    queueServiceability?.serviceability.status !== "serviceable" &&
    temporalHealth.worker_lock?.schema_version === 1
  ) {
    const message =
      "⚠️ Suspect live legacy v1 worker.lock with unproven queue serviceability — explicit approval is required for reclaim, or restart the owning OpenCode session.";
    pushStatusRecommendation(status, {
      kind: "health",
      priority: "high",
      title: "Suspect legacy worker.lock",
      detail: "queue serviceability is unproven",
      action:
        "explicit approval is required for reclaim, or restart the owning OpenCode session",
      source: "health",
      message,
    });
  }
}
