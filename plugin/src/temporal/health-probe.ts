import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
} from "../plugin-init";
import { getTemporalAddress } from "./client";
import {
  getTemporalOpTelemetry,
  getTemporalRetryTelemetry,
  getLastWorkerRunError,
  type OpTelemetry,
} from "./retry-wrapper";
import { canReachTemporalAddress } from "./runtime-manager";

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

export async function probeStaleQueues(): Promise<StaleQueue[]> {
  return [];
}

export async function getTemporalHealth(
  _projectId?: string,
): Promise<TemporalHealth> {
  const address = getTemporalAddress(process.env);
  const server_alive = await canReachTemporalAddress(address, 250).catch(
    () => false,
  );
  const registered_queues = getRegisteredTemporalWorkerQueues();
  const worker_process_alive = getTemporalWorkerAliveness();
  const telemetry = overrideTelemetry ?? getTemporalRetryTelemetry();

  return {
    server_alive,
    worker_alive: worker_process_alive || registered_queues.length > 0,
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
  };
}
