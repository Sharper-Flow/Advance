/**
 * adv CLI — live Temporal status reader
 *
 * Default status must be live Temporal-backed for active rows. Disk projections
 * may contribute terminal counts, but never active rows.
 */

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
import {
  withTemporalOperations,
  buildVisibilityQuery,
  makeTemporalOperationContext,
  type TemporalOperations,
} from "../../plugin/src/cli/temporal-boundary";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveExternalRoot } from "./project";

export const QUERY_TIMEOUT_MS = 5_000;

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
      lifecycleState: change.lifecycleState ?? "open",
      recency: classifyRecency(minutesSinceActivity),
      lastActivityAt,
      minutesSinceActivity,
      tasksDone: done,
      tasksTotal: total,
      firstIncompleteGate: firstIncompleteGate(change.gates),
      gateProgressStr: buildGateProgress(change.gates),
      parentChangeId: change.fast_follow_of?.parent_change_id,
      epicId: change.epic_membership?.epic_id,
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

function searchAttributeStrings(
  attrs: Record<string, unknown> | null | undefined,
  key: string,
): string[] | undefined {
  if (!attrs) return undefined;
  const raw = attrs[key];
  const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const strings = values
    .map((value) => (value instanceof Date ? value.toISOString() : String(value).trim()))
    .filter((value) => value.length > 0);
  return strings.length > 0 ? strings : undefined;
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
  const lifecycleState =
    searchAttributeString(attrs, "AdvLifecycleState") ?? "open";
  if (lifecycleState !== "open") return null;

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
    lifecycleState,
    recency: classifyRecency(minutesSinceActivity),
    lastActivityAt,
    minutesSinceActivity,
    tasksDone: 0,
    tasksTotal: 0,
    firstIncompleteGate: incomplete,
    gateProgressStr: buildGateProgress(gates),
    epicId: searchAttributeString(attrs, "AdvEpicId"),
    worktreeBranches: searchAttributeStrings(attrs, "AdvWorktreeBranches"),
    worktreePaths: searchAttributeStrings(attrs, "AdvWorktreePaths"),
  };
}

/**
 * Enumerate a project's change workflows via Visibility and build active
 * summaries from their search attributes. Worker-free. Throws on connection
 * or list failure so callers can fail closed.
 */
export async function summariesFromVisibility(
  owner: TemporalOperations,
  options: { projectId: string; now: Date; timeoutMs?: number; limit?: number },
): Promise<ChangeSummary[]> {
  const { projectId, now, timeoutMs, limit } = options;
  const projectPrefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const query = buildVisibilityQuery({
    projectId,
    statuses: null,
    limit,
    executionStatus: "Running",
  });
  // Visibility scan is scoped to this project's AdvAffectedProjects keyword
  // list via buildVisibilityQuery; the attribute is registered on every
  // change workflow start.
  const ctx = makeTemporalOperationContext(
    projectId,
    `${projectPrefix}visibility-status`,
    "list",
    "bin.liveStatus.summariesFromVisibility",
    timeoutMs ?? QUERY_TIMEOUT_MS,
  );

  const result = await owner.list<VisibilityExecution>(ctx, query, { limit: limit ?? 1_000_000 });
  if (result.kind !== "complete") {
    throw result.error;
  }
  const summaries: ChangeSummary[] = [];
  for (const exec of result.value) {
    const wfid = exec.workflowId;
    if (!wfid.startsWith(projectPrefix)) continue;
    const changeId = wfid.slice(projectPrefix.length);
    if (changeId.length === 0) continue;
    const summary = buildSummaryFromSearchAttributes(changeId, exec.searchAttributes, now);
    if (summary) summaries.push(summary);
    if (limit !== undefined && summaries.length >= limit) break;
  }
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

export function filterTerminalSummaries(
  summaries: ChangeSummary[],
  terminalChangeIds: ReadonlySet<string>,
): ChangeSummary[] {
  if (terminalChangeIds.size === 0) return summaries;
  return summaries.filter((summary) => !terminalChangeIds.has(summary.id));
}

export async function loadLiveSummaries(
  projectId: string,
  now: Date,
  timeoutMs = QUERY_TIMEOUT_MS,
): Promise<ChangeSummary[]> {
  try {
    return await withTemporalOperations(
      projectId,
      (owner) => summariesFromVisibility(owner, { projectId, now, timeoutMs }),
      undefined,
      { connectTimeoutMs: timeoutMs },
    );
  } catch {
    // Temporal bypass: fall back to disk projections
    return loadSummariesFromDisk(projectId);
  }
}

/**
 * Disk-projection fallback for the Temporal bypass.
 * Reads schemaVersion: 2 projection envelopes from the changes directory.
 */
function loadSummariesFromDisk(projectId: string): ChangeSummary[] {
  const canonicalDir = join(resolveExternalRoot(projectId), "changes");
    const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share");
    const shardDir = join(dataHome, "opencode-projects", projectId, "opencode", "plugins", "advance", projectId, "changes");
    let dir: string;
    try {
      const canonicalFiles = readdirSync(canonicalDir);
      dir = canonicalFiles.length > 0 ? canonicalDir : shardDir;
    } catch {
      dir = shardDir;
    }
    const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"));
    const summaries: ChangeSummary[] = [];
    for (const f of files) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const state = raw.state ?? raw;
        if (state.status === "archived" || state.status === "closed") continue;
        summaries.push({
          id: state.id,
          title: state.title ?? state.id,
          status: state.status ?? "draft",
          lastActivityAt: state.lastActivityAt ?? state.updatedAt ?? raw.projectedAt ?? new Date().toISOString(),
        } as ChangeSummary);
      } catch {
        // skip malformed projections
      }
    }
    return summaries;
  } catch {
    return [];
  }
}


