import { Client, Connection } from "@temporalio/client";
import {
  ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX,
  CHANGE_WORKFLOW_PREFIX,
  DEFAULT_TEMPORAL_ADDRESS,
  DEFAULT_TEMPORAL_NAMESPACE,
} from "./contracts";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function isLoopbackAddress(address: string): boolean {
  const host = address.includes(":")
    ? address.slice(0, address.lastIndexOf(":"))
    : address;
  return LOOPBACK_HOSTS.has(host);
}

function allowRemoteTemporal(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.ADV_TEMPORAL_ALLOW_REMOTE ?? "").toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

const SAFE_NAMESPACE_REGEX = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type TemporalEnv = NodeJS.ProcessEnv &
  Partial<Record<"ADV_TEMPORAL_ADDRESS" | "ADV_TEMPORAL_NAMESPACE", string>>;

export function getTemporalAddress(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = (env.ADV_TEMPORAL_ADDRESS ?? "").trim();
  const resolved = value || DEFAULT_TEMPORAL_ADDRESS;
  if (!isLoopbackAddress(resolved) && !allowRemoteTemporal(env)) {
    throw new Error(
      `Refusing to use non-loopback Temporal address "${resolved}" without ADV_TEMPORAL_ALLOW_REMOTE=true`,
    );
  }
  return resolved;
}

export function getTemporalNamespace(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const value = (env.ADV_TEMPORAL_NAMESPACE ?? "").trim();
  const resolved = value || DEFAULT_TEMPORAL_NAMESPACE;
  if (!SAFE_NAMESPACE_REGEX.test(resolved)) {
    throw new Error(
      `Invalid Temporal namespace "${resolved}" (allowed: A-Z a-z 0-9 . _ - , max 64 chars, first must be alphanumeric)`,
    );
  }
  return resolved;
}

export function buildProjectTaskQueue(projectId: string): string {
  return `${ADVANCE_TEMPORAL_TASK_QUEUE_PREFIX}-${projectId}`;
}

export function buildChangeWorkflowId(
  projectId: string,
  changeId: string,
): string {
  return `${CHANGE_WORKFLOW_PREFIX}${projectId}/${changeId}`;
}

export function buildEpicWorkflowId(projectId: string, epicId: string): string {
  return `adv/epic/${projectId}/${epicId}`;
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
