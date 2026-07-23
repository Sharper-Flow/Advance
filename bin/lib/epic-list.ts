/**
 * adv CLI — live Temporal Epic list reader
 *
 * Reads Epic workflow IDs from Temporal Visibility only. Does not read ADV
 * external state files and does not query or hydrate Epic workflow state.
 */

import {
  createTemporalClientBundle,
  listEpicWorkflows,
  type EpicWorkflowListEntry as TemporalEpicWorkflowListEntry,
  type ListEpicClient,
} from "../../plugin/src/cli/temporal-boundary";
import { QUERY_TIMEOUT_MS } from "./live-status";

export interface EpicListEntry {
  id: string;
  startTime: string | null;
}

export interface EpicListPayload {
  source: "temporal";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string | null;
  epics: EpicListEntry[];
  resume_projection?: unknown;
  error?: string;
  remediation?: string;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

export function buildLiveEpicListPayload(
  epics: TemporalEpicWorkflowListEntry[],
  options: {
    projectId: string;
    now: Date;
  },
): EpicListPayload {
  return {
    source: "temporal",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    epics: epics.map((epic) => ({
      id: epic.id,
      startTime: epic.startTime ? epic.startTime.toISOString() : null,
    })),
  };
}

export function buildLiveEpicListFailure(
  projectId: string | null,
  error: unknown,
  now: Date,
): EpicListPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "temporal",
    live: false,
    stale: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    epics: [],
    error: message,
    remediation:
      "Live ADV Epic list unavailable. Verify this command is running inside a git repository and Temporal is reachable.",
  };
}

export async function listEpicsFromVisibility(
  client: ListEpicClient,
  options: { projectId: string; timeoutMs?: number; status?: "active" | "all" },
): Promise<TemporalEpicWorkflowListEntry[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  return await withTimeout(
    listEpicWorkflows(client, {
      projectId: options.projectId,
      status: options.status ?? "active",
    }),
    timeoutMs,
    "Temporal Epic Visibility list",
  );
}

export async function loadLiveEpics(
  projectId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<TemporalEpicWorkflowListEntry[]> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    timeoutMs,
    "Temporal connection",
  );
  try {
    return await listEpicsFromVisibility(
      bundle.client as unknown as ListEpicClient,
      { projectId, timeoutMs, status: "active" },
    );
  } finally {
    await bundle.connection.close();
  }
}
