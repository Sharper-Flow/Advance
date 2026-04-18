import { Client, Connection } from "@temporalio/client";
import {
  ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX,
  DEFAULT_TEMPORAL_ADDRESS,
  DEFAULT_TEMPORAL_NAMESPACE,
} from "./contracts";

type TemporalEnv = NodeJS.ProcessEnv &
  Partial<Record<"ADV_TEMPORAL_ADDRESS" | "ADV_TEMPORAL_NAMESPACE", string>>;

export function getTemporalAddress(env: TemporalEnv = process.env): string {
  return env.ADV_TEMPORAL_ADDRESS?.trim() || DEFAULT_TEMPORAL_ADDRESS;
}

export function getTemporalNamespace(env: TemporalEnv = process.env): string {
  return env.ADV_TEMPORAL_NAMESPACE?.trim() || DEFAULT_TEMPORAL_NAMESPACE;
}

export function buildProjectTaskQueue(projectId: string): string {
  return `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${projectId}`;
}

export function buildChangeWorkflowId(
  projectId: string,
  changeId: string,
): string {
  return `adv/change/${projectId}/${changeId}`;
}

export function buildProjectWorkflowId(projectId: string): string {
  return `adv/project/${projectId}`;
}

export interface TemporalClientBundle {
  address: string;
  namespace: string;
  connection: Connection;
  client: Client;
}

export async function createTemporalClientBundle(
  env: TemporalEnv = process.env,
): Promise<TemporalClientBundle> {
  const address = getTemporalAddress(env);
  const namespace = getTemporalNamespace(env);
  const connection = await Connection.connect({ address });

  return {
    address,
    namespace,
    connection,
    client: new Client({ connection, namespace }),
  };
}
