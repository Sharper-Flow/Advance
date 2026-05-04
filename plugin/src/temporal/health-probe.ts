import { getTemporalAddress } from "./client";
import { getService, getStslStats } from "./service";
import {
  getTemporalRetryTelemetry,
  getTemporalOpTelemetry,
  getLastWorkerRunError,
  type OpTelemetry,
} from "./retry-wrapper";
import {
  type FallbackCounts,
  getTemporalFallbackTelemetry,
} from "./fallback-telemetry";
import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
} from "../plugin-init";
import { canReachTemporalAddress } from "./runtime-manager";
import { buildProjectTaskQueue, createTemporalClientBundle } from "./client";
import { getExternalRoot } from "../utils/project-id";
import {
  WORKER_LOCK_FILENAME,
  readLockContents,
  STALE_HEARTBEAT_MS,
  type WorkerLockContents,
} from "./worker-lock";
import { join } from "path";

/**
 * A project task queue flagged as stale by `probeStaleQueues`.
 *
 * Stale means the queue has `Running` workflows with no local poller
 * registered — the shape of the 2026-04-23 orphaned-workflow incident.
 * See `docs/temporal-recovery.md § "Stale adv/change/* and adv/project/* workflows"`.
 */
export interface StaleQueue {
  /** Fully-qualified task queue name, e.g. `advance-{projectId}`. */
  queue: string;
  /** Count of `Running` workflows on this queue older than the stale threshold. */
  running_count: number;
}

export interface TemporalHealth {
  server_alive: boolean;
  worker_alive: boolean;
  /**
   * Whether at least one registered worker child process / in-process worker
   * is currently running. Distinguishes "worker registered but dead after
   * restart exhaustion" from "worker registered and handling work".
   *
   * - OOP workers (Bun plugin host): reflects child process exit state.
   * - In-process workers (Node plugin host): true when the worker has at
   *   least one registered queue (shutdown clears the queue list).
   * - No worker registered (file-backed degraded mode): false.
   */
  worker_process_alive: boolean;
  registered_queues: string[];
  last_op_at: string | null;
  last_error: string | null;
  /** Per-domain counters for Temporal→legacy store fallback events. */
  fallback_counts: FallbackCounts;
  /** Queues with Running workflows older than the stale threshold and no local poller. */
  stale_queues: StaleQueue[];
  /**
   * Number of successful STSL reconnect events since plugin init.
   * Increments only when `reinitStsl` succeeds (close + Connection.connect +
   * search-attribute re-registration). Useful for diagnosing connection
   * stability — sustained growth means the Temporal server is flapping or
   * an intermediate proxy is dropping the gRPC channel.
   */
  reconnect_count: number;
  /** Per-op telemetry counters (top-N most active ops, KD-3). */
  op_counters: OpTelemetry[];
  worker_lock: WorkerLockHealth | null;
  last_worker_run_error: {
    queue: string;
    message: string;
    at: string;
  } | null;
}

export interface WorkerLockHealth {
  holder_pid: number;
  last_heartbeat_at: string | null;
  heartbeat_age_ms: number | null;
  schema_version: 1 | 2;
}

let overrideTelemetry: {
  lastOpAt: string | null;
  lastError: string | null;
} | null = null;

export function setTemporalHealthProbeState(input: {
  lastOpAt: string | null;
  lastError: string | null;
}): void {
  overrideTelemetry = input;
}

export function resetTemporalHealthProbeState(): void {
  overrideTelemetry = null;
}

const STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Detect stale task queues for the current project.
 *
 * "Stale" = `Running` workflows on the project queue older than
 * `STALE_THRESHOLD_MS` (5 min) with no matching local poller — the
 * shape that caused the 2026-04-23 orphaned-workflow incident.
 *
 * Short-circuits and returns `[]` when:
 * - `projectId` is falsy (no current project to probe)
 * - the project queue is already in `registeredQueues` (local poller is live)
 *
 * Opens a fresh Temporal client bundle per call and closes it in
 * `finally`. Caller-visible failures are swallowed: stale-queue
 * detection is advisory and must not break `adv_status`; base Temporal
 * health is surfaced separately.
 *
 * @param projectId - Current project id, or `undefined` when unknown.
 * @param registeredQueues - Queues currently served by a local worker.
 * @returns One `StaleQueue` entry per stale project queue, or `[]`.
 */
export async function probeStaleQueues(
  projectId: string | undefined,
  registeredQueues: string[],
): Promise<StaleQueue[]> {
  if (!projectId) return [];

  const queue = buildProjectTaskQueue(projectId);
  if (registeredQueues.includes(queue)) return [];

  const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS).toISOString();
  const query = `TaskQueue="${queue}" AND ExecutionStatus="Running" AND StartTime < "${cutoff}"`;

  let bundle;
  try {
    bundle = await createTemporalClientBundle();
    const result = await bundle.client.workflow.count(query);
    if (result.count > 0) {
      return [{ queue, running_count: result.count }];
    }
    return [];
  } catch {
    // Stale-queue detection is advisory only. Failure here must not break
    // `adv_status`; callers already surface base Temporal health separately.
    return [];
  } finally {
    if (bundle) {
      await bundle.connection.close();
    }
  }
}

async function readWorkerLockHealth(
  projectId: string | undefined,
): Promise<WorkerLockHealth | null> {
  if (!projectId) return null;
  try {
    const contents: WorkerLockContents | null = await readLockContents(
      join(getExternalRoot(projectId), WORKER_LOCK_FILENAME),
    );
    if (!contents) return null;
    const lastHeartbeatAt =
      contents.schema_version === 2 ? contents.last_heartbeat : null;
    const heartbeatAgeMs = lastHeartbeatAt
      ? Math.max(0, Date.now() - Date.parse(lastHeartbeatAt))
      : null;
    return {
      holder_pid: contents.pid,
      last_heartbeat_at: lastHeartbeatAt,
      heartbeat_age_ms: heartbeatAgeMs,
      schema_version: contents.schema_version ?? 1,
    };
  } catch {
    return null;
  }
}

export async function getTemporalHealth(
  projectId?: string,
): Promise<TemporalHealth> {
  const server_alive = await (async () => {
    try {
      const address = getTemporalAddress(process.env);
      const reachable = await canReachTemporalAddress(address, 250);
      if (!reachable) return false;
      // The Temporal service layer owns the connection lifecycle here; this
      // probe only checks whether the service is available.
      return getService() !== null;
    } catch {
      return false;
    }
  })();

  const registered_queues = getRegisteredTemporalWorkerQueues();
  // retry-wrapper may add internal telemetry fields over time (for example
  // `lastAttempts`). TemporalHealth intentionally surfaces only the stable
  // status fields used by current callers.
  const telemetry = overrideTelemetry ?? getTemporalRetryTelemetry();
  const worker_process_alive = getTemporalWorkerAliveness();
  const worker_lock = await readWorkerLockHealth(projectId);
  const last_worker_run_error = getLastWorkerRunError();

  let stale_queues: StaleQueue[] = [];
  if (server_alive && projectId) {
    try {
      stale_queues = await probeStaleQueues(projectId, registered_queues);
    } catch {
      stale_queues = [];
    }
  }

  const ops = getTemporalOpTelemetry();
  const opCounters = ops
    .sort(
      (a, b) =>
        b.successCount + b.failureCount - (a.successCount + a.failureCount),
    )
    .slice(0, 10);

  // worker_alive combines two signals:
  //   1. Local process has registered queues (this process owns the worker).
  //   2. Worker lock holder has a fresh heartbeat (another process owns the
  //      worker but it's alive). This closes the multi-session false-negative
  //      where Session B diagnoses "worker dead" because it checks its own
  //      empty registry while Session A's worker is running. See GH #6.
  const worker_alive =
    registered_queues.length > 0 ||
    (worker_lock != null &&
      worker_lock.heartbeat_age_ms != null &&
      worker_lock.heartbeat_age_ms >= 0 &&
      worker_lock.heartbeat_age_ms < STALE_HEARTBEAT_MS);

  return {
    server_alive,
    worker_alive,
    worker_process_alive,
    registered_queues,
    last_op_at: telemetry.lastOpAt,
    last_error: telemetry.lastError,
    fallback_counts: getTemporalFallbackTelemetry(),
    stale_queues,
    reconnect_count: getStslStats().reconnectCount,
    op_counters: opCounters,
    worker_lock,
    last_worker_run_error,
  };
}
