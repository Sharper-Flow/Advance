import { createTemporalClientBundle } from "./client";
import { getTemporalRetryTelemetry } from "./retry-wrapper";
import { getRegisteredTemporalWorkerQueues } from "../plugin-init";

export interface TemporalHealth {
  server_alive: boolean;
  worker_alive: boolean;
  registered_queues: string[];
  last_op_at: string | null;
  last_error: string | null;
}

let overrideTelemetry: { lastOpAt: string | null; lastError: string | null } | null = null;

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
  let close: (() => Promise<void>) | undefined;
  const server_alive = await (async () => {
    try {
      const bundle = await createTemporalClientBundle(process.env);
      close = () => bundle.connection.close();
      return true;
    } catch {
      return false;
    } finally {
      await close?.().catch(() => undefined);
    }
  })();

  const registered_queues = getRegisteredTemporalWorkerQueues();
  const telemetry = overrideTelemetry ?? getTemporalRetryTelemetry();

  return {
    server_alive,
    worker_alive: registered_queues.length > 0,
    registered_queues,
    last_op_at: telemetry.lastOpAt,
    last_error: telemetry.lastError,
  };
}
