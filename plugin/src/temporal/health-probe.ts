import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
} from "../plugin-init";
import { getTemporalAddress, buildProjectTaskQueue } from "./client";
import {
  getTemporalOpTelemetry,
  getTemporalRetryTelemetry,
  getLastWorkerRunError,
  type OpTelemetry,
} from "./retry-wrapper";
import { canReachTemporalAddress } from "./runtime-manager";
import {
  probeTaskQueuePollers,
  type ServerPollerProbe,
} from "./queue-serviceability";
import { getService } from "./service";

export interface QueueProbeTarget {
  queueName: string;
  queueType: "session" | "project";
}

export interface QueueProbeResult {
  queueName: string;
  queueType: "session" | "project";
  serviceable: boolean;
  pollerCount: number;
  lastPollerAt: string | null;
}

export interface StaleQueue {
  queue: string;
  running_count: number;
}

export interface WorkerLockHealth {
  holder_pid: number;
  schema_version: 1;
}

export interface TemporalHealth {
  server_alive: boolean;
  worker_alive: boolean;
  worker_process_alive: boolean;
  registered_queues: string[];
  last_op_at: string | null;
  last_error: string | null;
  fallback_counts: Record<string, number>;
  stale_queues: StaleQueue[];
  reconnect_count: number;
  op_counters: OpTelemetry[];
  worker_lock: WorkerLockHealth | null;
  last_worker_run_error: {
    queue: string;
    message: string;
    at: string;
  } | null;
  server_poller_probe?: ServerPollerProbe | null;
  queues?: QueueProbeResult[];
  /** True when the probe itself timed out but server/worker are assumed reachable. */
  probe_degraded?: boolean;
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
  pollerProbeCache.clear();
}

export async function probeStaleQueues(): Promise<StaleQueue[]> {
  return [];
}

const pollerProbeCache = new Map<
  string,
  { result: ServerPollerProbe; cachedAt: number }
>();
const POLLER_PROBE_TTL_MS = 30_000;

async function probeQueues(
  targets: QueueProbeTarget[],
  _signal?: AbortSignal,
): Promise<
  Array<{ result: QueueProbeResult; probe: ServerPollerProbe | null }>
> {
  const bundle = getService();
  if (!bundle || targets.length === 0) {
    return [];
  }

  const now = Date.now();
  const results: Array<{
    result: QueueProbeResult;
    probe: ServerPollerProbe | null;
  }> = [];

  for (const target of targets) {
    let probe: ServerPollerProbe | null;
    const cached = pollerProbeCache.get(target.queueName);
    if (cached && now - cached.cachedAt < POLLER_PROBE_TTL_MS) {
      probe = cached.result;
    } else {
      try {
        probe = await probeTaskQueuePollers({
          connection: bundle.connection as unknown as Parameters<
            typeof probeTaskQueuePollers
          >[0]["connection"],
          namespace: bundle.namespace,
          taskQueue: target.queueName,
        });
        pollerProbeCache.set(target.queueName, {
          result: probe,
          cachedAt: now,
        });
      } catch {
        probe = null;
      }
    }

    results.push({
      result: {
        queueName: target.queueName,
        queueType: target.queueType,
        serviceable: probe?.status === "fresh",
        pollerCount: probe?.pollerCount ?? 0,
        lastPollerAt: probe?.lastPollerAt ?? null,
      },
      probe,
    });
  }

  return results;
}

export async function getTemporalHealth(
  _projectIdOrTargets?: string | QueueProbeTarget[],
  options: { signal?: AbortSignal } = {},
): Promise<TemporalHealth> {
  const address = getTemporalAddress(process.env);
  const server_alive = await canReachTemporalAddress(address, 250, {
    signal: options.signal,
  }).catch(() => false);
  const registered_queues = getRegisteredTemporalWorkerQueues();
  const worker_process_alive = getTemporalWorkerAliveness();
  const telemetry = overrideTelemetry ?? getTemporalRetryTelemetry();

  const targets: QueueProbeTarget[] = Array.isArray(_projectIdOrTargets)
    ? _projectIdOrTargets
    : _projectIdOrTargets
      ? [
          {
            queueName: buildProjectTaskQueue(_projectIdOrTargets),
            queueType: "project",
          },
        ]
      : [];

  const probed = await probeQueues(targets, options.signal);
  const queues = probed.map((p) => p.result);
  const serverPollerProbe =
    probed.find((p) => p.result.queueType === "project")?.probe ?? null;

  return {
    server_alive,
    worker_alive:
      worker_process_alive ||
      registered_queues.length > 0 ||
      queues.some((q) => q.serviceable),
    worker_process_alive,
    registered_queues,
    last_op_at: telemetry.lastOpAt,
    last_error: telemetry.lastError,
    fallback_counts: {},
    stale_queues: [],
    reconnect_count: 0,
    op_counters: getTemporalOpTelemetry(),
    worker_lock: null,
    last_worker_run_error: getLastWorkerRunError(),
    server_poller_probe: serverPollerProbe,
    queues,
  };
}
