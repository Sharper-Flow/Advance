/**
 * adv CLI — live Temporal status reader
 *
 * Default status must be live Temporal-backed for active rows. Disk projections
 * may contribute terminal counts, but never active rows.
 */

import type { Client } from "@temporalio/client";

import {
  buildGateProgress,
  classifyRecency,
  computeLastActivity,
  countTasks,
  firstIncompleteGate,
} from "./changes";
import type { ChangeRecord, ChangeSummary, LiveStatusPayload } from "./types";
import { listChangeWorkflowIds } from "../../plugin/src/temporal/list-change-workflows";
import {
  buildChangeWorkflowId,
  createTemporalClientBundle,
} from "../../plugin/src/temporal/client";
import { CHANGE_WORKFLOW_QUERY_NAMES } from "../../plugin/src/temporal/contracts";

export const QUERY_TIMEOUT_MS = 5_000;

export interface LiveStatusClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<{ workflowId: string }>;
    getHandle: (workflowId: string) => {
      query: (queryName: string) => Promise<unknown>;
    };
  };
}

export interface ListLiveChangeStatesOptions {
  projectId: string;
  timeoutMs?: number;
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

function normalizeWorkflowState(raw: any): ChangeRecord {
  return {
    id: String(raw.id ?? raw.changeId ?? ""),
    title: String(raw.title ?? raw.id ?? raw.changeId ?? "(untitled)"),
    status: String(raw.status ?? "draft"),
    created_at: String(
      raw.created_at ?? raw.createdAt ?? raw.initializedAt ?? new Date(0).toISOString(),
    ),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    gates: raw.gates && typeof raw.gates === "object" ? raw.gates : {},
    wisdom: Array.isArray(raw.wisdom) ? raw.wisdom : [],
    validation: raw.validation,
    fast_follow_of: raw.fast_follow_of,
    lastSignalAt: raw.lastSignalAt,
  };
}

export async function listLiveChangeStates(
  client: LiveStatusClient,
  options: ListLiveChangeStatesOptions,
): Promise<ChangeRecord[]> {
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  const ids = await withTimeout(
    listChangeWorkflowIds(client, { projectId: options.projectId }),
    timeoutMs,
    "Temporal Visibility list",
  );

  const changes: ChangeRecord[] = [];
  for (const id of ids) {
    const workflowId = buildChangeWorkflowId(options.projectId, id);
    const raw = await withTimeout(
      client.workflow.getHandle(workflowId).query(CHANGE_WORKFLOW_QUERY_NAMES.getState),
      timeoutMs,
      `Temporal query ${id}`,
    );
    changes.push(normalizeWorkflowState(raw));
  }

  return changes;
}

export function summarizeLiveChanges(
  changes: ChangeRecord[],
  now: Date,
): ChangeSummary[] {
  const summaries = changes.map((change) => {
    const lastActivityAt = computeLastActivity(change);
    const activityDate = new Date(lastActivityAt);
    const minutesSinceActivity = Math.max(
      0,
      Math.floor((now.getTime() - activityDate.getTime()) / 60000),
    );
    const { done, total } = countTasks(change.tasks);

    return {
      id: change.id,
      title: change.title,
      status: change.status,
      recency: classifyRecency(minutesSinceActivity),
      lastActivityAt,
      minutesSinceActivity,
      tasksDone: done,
      tasksTotal: total,
      firstIncompleteGate: firstIncompleteGate(change.gates),
      gateProgressStr: buildGateProgress(change.gates),
      parentChangeId: change.fast_follow_of?.parent_change_id,
    };
  });

  summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return summaries;
}

export function buildLiveStatusPayload(
  changes: ChangeRecord[],
  options: {
    projectId: string;
    archivedCount: number;
    closedCount: number;
    now: Date;
  },
): LiveStatusPayload {
  const summaries = summarizeLiveChanges(changes, options.now);
  return {
    source: "temporal",
    live: true,
    stale: false,
    generated_at: options.now.toISOString(),
    project_id: options.projectId,
    counts: {
      active: summaries.length,
      archived: options.archivedCount,
      closed: options.closedCount,
    },
    changes: summaries,
  };
}

export function buildLiveStatusFailure(
  projectId: string,
  error: unknown,
  now: Date,
): LiveStatusPayload {
  const message = error instanceof Error ? error.message : String(error);
  return {
    source: "temporal",
    live: false,
    stale: false,
    generated_at: now.toISOString(),
    project_id: projectId,
    counts: { active: 0, archived: 0, closed: 0 },
    changes: [],
    error: message,
    remediation:
      "Live ADV status unavailable. Verify Temporal is running (`systemctl --user status temporal-dev`) and restart OpenCode/ADV worker if needed.",
  };
}

export async function loadLiveStatus(
  projectId: string,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<ChangeRecord[]> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    timeoutMs,
    "Temporal connection",
  );
  try {
    return await listLiveChangeStates(bundle.client as Client, {
      projectId,
      timeoutMs,
    });
  } finally {
    await bundle.connection.close();
  }
}
