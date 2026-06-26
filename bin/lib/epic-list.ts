/**
 * adv CLI — live Temporal Epic list reader
 *
 * Reads Epic workflow IDs from Temporal Visibility only. Does not read ADV
 * external state files and does not query or hydrate Epic workflow state.
 */

import {
  createTemporalClientBundle,
} from "../../plugin/src/temporal/client";
import {
  listEpicWorkflowIds,
  type ListEpicClient,
} from "../../plugin/src/temporal/list-epic-workflows";
import { QUERY_TIMEOUT_MS } from "./live-status";

export interface EpicListEntry {
  id: string;
}

export interface EpicListPayload {
  source: "temporal";
  live: boolean;
  stale: false;
  generated_at: string;
  project_id: string | null;
  epics: EpicListEntry[];
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
  ids: string[],
  options: { projectId: string; now: Date },
): EpicListPayload {
  return {
    source: "temporal",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    epics: ids.map((id) => ({ id })),
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

export async function listEpicIdsFromVisibility(
  client: ListEpicClient,
  options: { projectId: string; timeoutMs?: number },
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  return await withTimeout(
    listEpicWorkflowIds(client, { projectId: options.projectId }),
    timeoutMs,
    "Temporal Epic Visibility list",
  );
}

export async function loadLiveEpicIds(
  projectId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<string[]> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    timeoutMs,
    "Temporal connection",
  );
  try {
    return await listEpicIdsFromVisibility(
      bundle.client as unknown as ListEpicClient,
      { projectId, timeoutMs },
    );
  } finally {
    await bundle.connection.close();
  }
}
