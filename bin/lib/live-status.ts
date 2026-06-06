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
  GATE_ORDER,
} from "./changes";
import type {
  ChangeRecord,
  ChangeSummary,
  GateState,
  LiveStatusPayload,
} from "./types";
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
      raw.created_at ??
        raw.createdAt ??
        raw.initializedAt ??
        new Date(0).toISOString(),
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
      client.workflow
        .getHandle(workflowId)
        .query(CHANGE_WORKFLOW_QUERY_NAMES.getState),
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

// ===========================================================================
// Worker-free read path: build summaries from Visibility search attributes.
//
// Change workflows upsert AdvChangeId/Title/Status/CurrentGate/LastSignalAt/
// CreatedAt as Temporal Visibility search attributes on every signal. Those
// are server-side data returned by `client.workflow.list` with no worker
// polling required, so the default status table no longer needs a per-change
// `getState` workflow query (which depends on a live per-project worker).
// ===========================================================================

const CHANGE_WORKFLOW_PREFIX = "adv/change/";

export interface VisibilityExecution {
  workflowId: string;
  searchAttributes?: Record<string, unknown> | null;
}

export interface VisibilityListClient {
  workflow: {
    list: (opts: { query: string }) => AsyncIterable<VisibilityExecution>;
  };
}

function firstSearchAttribute(
  attrs: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!attrs) return undefined;
  const value = attrs[key];
  if (Array.isArray(value)) return value.length > 0 ? value[0] : undefined;
  return value;
}

function searchAttributeString(
  attrs: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = firstSearchAttribute(attrs, key);
  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

/**
 * Synthesize a 7-gate map from the `AdvCurrentGate` search attribute.
 * Gates before the current gate are `done`; the current gate and later
 * gates are `pending`. `done` (all gates complete) yields an all-done map.
 * Undefined falls back to "nothing done" (current gate = first gate).
 */
function gatesFromCurrentGate(
  currentGate: string | undefined,
): Record<string, GateState> {
  const gates: Record<string, GateState> = {};
  const currentIndex =
    currentGate === undefined
      ? 0
      : currentGate === "done"
        ? GATE_ORDER.length
        : GATE_ORDER.indexOf(currentGate as (typeof GATE_ORDER)[number]);
  const boundary = currentIndex < 0 ? 0 : currentIndex;
  GATE_ORDER.forEach((gate, index) => {
    gates[gate] = { status: index < boundary ? "done" : "pending" };
  });
  return gates;
}

/**
 * Build a ChangeSummary purely from a change workflow's Visibility search
 * attributes. Returns `null` for terminal-complete changes (all gates done),
 * which are excluded from active rows.
 */
export function buildSummaryFromSearchAttributes(
  changeId: string,
  attrs: Record<string, unknown> | null | undefined,
  now: Date,
): ChangeSummary | null {
  const currentGate = searchAttributeString(attrs, "AdvCurrentGate");
  const gates = gatesFromCurrentGate(currentGate);
  const incomplete = firstIncompleteGate(gates);
  if (incomplete === null) return null;

  const lastActivityAt =
    searchAttributeString(attrs, "AdvLastSignalAt") ??
    searchAttributeString(attrs, "AdvCreatedAt") ??
    now.toISOString();
  const minutesSinceActivity = Math.max(
    0,
    Math.floor((now.getTime() - new Date(lastActivityAt).getTime()) / 60000),
  );

  return {
    id: changeId,
    title: searchAttributeString(attrs, "AdvChangeTitle") ?? changeId,
    status: searchAttributeString(attrs, "AdvChangeStatus") ?? "draft",
    recency: classifyRecency(minutesSinceActivity),
    lastActivityAt,
    minutesSinceActivity,
    tasksDone: 0,
    tasksTotal: 0,
    firstIncompleteGate: incomplete,
    gateProgressStr: buildGateProgress(gates),
  };
}

/**
 * Enumerate a project's change workflows via Visibility and build active
 * summaries from their search attributes. Worker-free. Throws on connection
 * or list failure so callers can fail closed.
 */
export async function summariesFromVisibility(
  client: VisibilityListClient,
  options: { projectId: string; now: Date; timeoutMs?: number },
): Promise<ChangeSummary[]> {
  const { projectId, now } = options;
  const timeoutMs = options.timeoutMs ?? QUERY_TIMEOUT_MS;
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const safeProjectId = projectId.replace(/"/g, '\\"');
  const query =
    `AdvAffectedProjects = "${safeProjectId}" ` +
    `AND AdvChangeStatus IN ("draft", "pending", "active")`;

  const collect = async (): Promise<ChangeSummary[]> => {
    const summaries: ChangeSummary[] = [];
    for await (const exec of client.workflow.list({ query })) {
      const wfid = exec.workflowId;
      if (!wfid.startsWith(projectPrefix)) continue;
      const changeId = wfid.slice(projectPrefix.length);
      if (changeId.length === 0) continue;
      const summary = buildSummaryFromSearchAttributes(
        changeId,
        exec.searchAttributes,
        now,
      );
      if (summary) summaries.push(summary);
    }
    return summaries;
  };

  const summaries = await withTimeout(
    collect(),
    timeoutMs,
    "Temporal Visibility list",
  );
  summaries.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  return summaries;
}

export function buildLiveStatusPayloadFromSummaries(
  summaries: ChangeSummary[],
  options: {
    projectId: string;
    archivedCount: number;
    closedCount: number;
    now: Date;
  },
): LiveStatusPayload {
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

export async function loadLiveSummaries(
  projectId: string,
  now: Date,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<ChangeSummary[]> {
  const bundle = await withTimeout(
    createTemporalClientBundle(),
    timeoutMs,
    "Temporal connection",
  );
  try {
    return await summariesFromVisibility(
      bundle.client as unknown as VisibilityListClient,
      { projectId, now, timeoutMs },
    );
  } finally {
    await bundle.connection.close();
  }
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
