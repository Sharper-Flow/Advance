import { getTemporalAddress } from "./client";
import { getService } from "./service";
import { getTemporalRetryTelemetry } from "./retry-wrapper";
import { getTemporalFallbackTelemetry } from "./fallback-telemetry";
import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
} from "../plugin-init";
import { canReachTemporalAddress } from "./runtime-manager";

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

export async function getTemporalHealth(): Promise<TemporalHealth> {
  const server_alive = await (async () => {
    try {
      const address = getTemporalAddress(process.env);
      const reachable = await canReachTemporalAddress(address, 250);
      if (!reachable) return false;
      // STSL owns the connection lifecycle; probe just checks if service is available
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

  return {
    server_alive,
    worker_alive: registered_queues.length > 0,
    worker_process_alive,
    registered_queues,
    last_op_at: telemetry.lastOpAt,
    last_error: telemetry.lastError,
    fallback_counts: getTemporalFallbackTelemetry(),
  } as TemporalHealth;
}
