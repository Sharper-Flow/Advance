/**
 * adv CLI — live Temporal Epic list reader
 *
 * Reads Epic workflow IDs from Temporal Visibility only. Does not read ADV
 * external state files and does not query or hydrate Epic workflow state.
 */

import {
  createTemporalClientBundle,
  listEpicWorkflowIds,
  type ListEpicClient,
} from "../../plugin/src/cli/temporal-boundary";
import { listChanges } from "./changes";
import { join } from "path";
import { QUERY_TIMEOUT_MS } from "./live-status";

export interface EpicListEntry {
  id: string;
  currentChildChangeId?: string;
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
  options: {
    projectId: string;
    now: Date;
    currentChildByEpicId?: ReadonlyMap<string, string>;
  },
): EpicListPayload {
  return {
    source: "temporal",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    epics: ids.map((id) => {
      const currentChildChangeId = options.currentChildByEpicId?.get(id);
      return currentChildChangeId ? { id, currentChildChangeId } : { id };
    }),
  };
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]+$/.test(value);
}

function computeLastActivity(change: {
  created_at?: string;
  lastSignalAt?: string;
  tasks?: { created_at?: string; started_at?: string; completed_at?: string }[];
  gates?: Record<string, { completed_at?: string }>;
}): string {
  let latest = change.created_at ?? "";
  const consider = (value: string | undefined) => {
    if (value && value > latest) latest = value;
  };
  consider(change.lastSignalAt);
  for (const task of change.tasks ?? []) {
    consider(task.created_at);
    consider(task.started_at);
    consider(task.completed_at);
  }
  for (const gate of Object.values(change.gates ?? {})) {
    consider(gate.completed_at);
  }
  return latest;
}

export async function loadCurrentChildByEpicId(
  advanceRoot: string,
): Promise<Map<string, string>> {
  const candidates: Array<{ epicId: string; changeId: string; lastActivityAt: string }> = [];
  for await (const change of listChanges(join(advanceRoot, "changes"), {
    quiet: true,
  })) {
    if (change.status === "archived" || change.status === "closed") continue;
    const epicId = change.epic_membership?.epic_id;
    if (!isValidId(epicId) || !isValidId(change.id)) continue;
    candidates.push({
      epicId,
      changeId: change.id,
      lastActivityAt: computeLastActivity(change),
    });
  }
  candidates.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

  const byEpicId = new Map<string, string>();
  for (const candidate of candidates) {
    if (!byEpicId.has(candidate.epicId)) {
      byEpicId.set(candidate.epicId, candidate.changeId);
    }
  }
  return byEpicId;
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
  options: { projectId: string; timeoutMs?: number; status?: "active" | "all" },
): Promise<string[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  return await withTimeout(
    listEpicWorkflowIds(client, {
      projectId: options.projectId,
      status: options.status ?? "active",
    }),
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
      { projectId, timeoutMs, status: "active" },
    );
  } finally {
    await bundle.connection.close();
  }
}
