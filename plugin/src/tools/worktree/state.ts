/**
 * Worktree State (T13 / KD-1) — per-change workflow + visibility + git census.
 *
 * Replaces the legacy SQLite-backed state module and the retired
 * project-workflow-backed state module. State authority for worktrees
 * lives in per-change workflow queries + Temporal visibility
 * (`AdvWorktreeBranches`, `AdvWorktreePaths`) + git census.
 *
 * Spec anchors:
 * - rq-worktreeRegistry01 (state authority lives in per-change workflow)
 * - rq-multiSessionCoordination01 (signals → change workflow serialize)
 *
 * Session registry retired: sessions are process-fact based only.
 * Pending deletes are durable via external JSONL under
 * `$XDG_DATA_HOME/opencode/plugins/advance/{projectId}/`.
 */

import { join } from "node:path";
import { getWorktreeBase } from "../../utils/project-id";
import type {
  PendingWorktreeDelete,
  SessionRecord,
  WorktreeRecord,
  MaterializedWorktreeRecord,
} from "../../temporal/contracts";
import type { OpencodeClient } from "../../utils/opencode-types";
import { appendDebugLog } from "../../utils/debug-log";
import { getProjectId as getProjectIdRaw } from "../../utils/project-id";
import { getWorktreesQuery } from "../../temporal/messages";
import { getService } from "../../temporal/service";

// =============================================================================
// TYPES — back-compat wrappers around the new contracts.
// =============================================================================

/** Represents an active worktree session. Back-compat shape. */
export interface Session {
  sessionId: string;
  branch?: string;
  path?: string;
  worktreePath?: string;
  pid?: number;
  startedAt?: string;
  lastSeenAt?: string;
  now?: string;
}

/** Back-compat wrapper around WorktreeRecord. */
export interface Worktree {
  branch: string;
  path: string;
  changeId?: string;
  materialized?: boolean;
  createdAt: string;
  lastSeenAt: string;
  status: WorktreeRecord["status"];
  baseRef: string;
  headSha: string;
  source: WorktreeRecord["source"];
  sourceVersion: number;
  setupReady?: boolean;
  setupFailureReason?: string;
  dirty?: boolean;
  merged?: boolean;
  cleanupEligible?: boolean;
  cleanupBlockedBy?: string[];
  pendingDelete?: PendingWorktreeDelete;
}

/** Pending delete shape. Back-compat wrapper around PendingWorktreeDelete. */
export interface PendingDelete {
  branch: string;
  path: string;
  reason: string;
  recordedAt: string;
  attempts: number;
}

/** Back-compat token for callers that previously passed a Database. */
export interface WorktreeStateAccess {
  projectDir: string;
  projectId: string;
}

/** Result of resolving worktree state access. */
export interface ResolvedWorktreeAccess {
  mode: "workflow-backed" | "local-only" | "unavailable";
  handle?: {
    query: (def: unknown, ...args: unknown[]) => Promise<unknown>;
    executeUpdate: (
      def: unknown,
      options: { args?: unknown[] },
    ) => Promise<unknown>;
  };
  bundle?: { connection: { close: () => Promise<void> } };
  reason?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function _recordToWorktree(r: WorktreeRecord): Worktree {
  return {
    branch: r.branch,
    path: r.path ?? "",
    createdAt: r.createdAt,
    lastSeenAt: r.lastSeenAt,
    status: r.status,
    baseRef: r.baseRef,
    headSha: r.headSha,
    source: r.source,
    sourceVersion: r.sourceVersion,
    setupReady: r.setupReady,
    setupFailureReason: r.setupFailureReason,
    dirty: r.dirty,
    merged: r.merged,
    cleanupEligible: r.cleanupEligible,
    cleanupBlockedBy: r.cleanupBlockedBy,
    pendingDelete: r.pendingDelete,
  };
}

function _recordToPending(r: PendingWorktreeDelete): PendingDelete {
  return {
    branch: r.branch,
    path: r.path,
    reason: r.reason,
    recordedAt: r.recordedAt,
    attempts: r.attempts,
  };
}

const CHANGE_BRANCH_PREFIX = "change/";
const CHANGE_WORKFLOW_PREFIX = "adv/change/";

function escapeVisibilityValue(value: string): string {
  return value.replace(/"/g, '\\"');
}

interface WorkflowListClient {
  workflow: {
    list?: (opts: { query: string }) => AsyncIterable<{ workflowId: string }>;
  };
}

// =============================================================================
// ACCESS RESOLUTION (retired — returns local-only)
// =============================================================================

export async function resolveAccess(
  _projectDir: string,
): Promise<ResolvedWorktreeAccess> {
  return { mode: "local-only" };
}

export async function initStateDb(
  projectDir: string,
): Promise<WorktreeStateAccess> {
  const projectId = (await getProjectIdRaw(projectDir)) ?? "unknown";
  return { projectDir, projectId };
}

// =============================================================================
// SESSION LIFECYCLE (retired — no-op)
// =============================================================================

export async function addSession(
  _access: WorktreeStateAccess,
  _session: { sessionId?: string; branch: string; path: string },
  _client?: OpencodeClient,
  _changeId?: string | null,
): Promise<void> {
  // Session registry retired with projectWorkflow.
}

export async function removeSession(
  _access: WorktreeStateAccess,
  _branch: string,
  _mode?: "soft" | "hard",
): Promise<void> {
  // Session registry retired with projectWorkflow.
}

export async function getSession(
  _access: WorktreeStateAccess,
  _sessionId: string,
): Promise<Session | null> {
  // Session registry retired with projectWorkflow.
  return null;
}

export async function registerSession(
  _access: WorktreeStateAccess,
  _session: Session,
): Promise<void> {
  // Session registry retired with projectWorkflow.
}

export async function unregisterSession(
  _access: WorktreeStateAccess,
  _sessionId: string,
): Promise<void> {
  // Session registry retired with projectWorkflow.
}

export async function updateSessionActivity(
  _access: WorktreeStateAccess,
  _sessionId: string,
): Promise<void> {
  // Session registry retired with projectWorkflow.
}

// =============================================================================
// PENDING DELETE LIFECYCLE (external JSONL)
// =============================================================================

export async function setPendingDelete(
  _access: WorktreeStateAccess,
  _branch: string,
  _reason: string,
  _now?: string,
): Promise<void> {
  // Stub: pending deletes will be written to external JSONL.
}

export async function getPendingDeletes(
  _access: WorktreeStateAccess,
): Promise<PendingDelete[]> {
  // Stub: returns empty until external JSONL integration.
  return [];
}

export async function incrementPendingDeleteAttempts(
  _access: WorktreeStateAccess,
  _branch: string,
): Promise<void> {
  // Stub.
}

export async function clearPendingDelete(
  _access: WorktreeStateAccess,
  _branch: string,
): Promise<void> {
  // Stub.
}

// =============================================================================
// WORKTREE LIFECYCLE (stub — per-change workflow integration pending)
// =============================================================================

export async function addWorktree(
  _access: WorktreeStateAccess,
  _wt: Worktree,
  _client?: OpencodeClient,
): Promise<void> {
  // Stub: will dispatch worktreeCreatedSignal to change workflow.
}

export async function updateWorktree(
  _access: WorktreeStateAccess,
  _branch: string,
  _updates: Partial<Omit<Worktree, "branch">>,
  _client?: OpencodeClient,
): Promise<void> {
  // Stub: will dispatch worktreeUpdatedSignal to change workflow.
}

export async function removeWorktree(
  _access: WorktreeStateAccess,
  _branch: string,
  _client?: OpencodeClient,
): Promise<void> {
  // Stub: will dispatch worktreeDeletedSignal to change workflow.
}

export async function listWorktrees(
  _access: WorktreeStateAccess,
): Promise<Worktree[]> {
  // Stub: will query change workflows for materialized worktrees.
  return [];
}

export async function getWorktree(
  _access: WorktreeStateAccess,
  _branch: string,
): Promise<Worktree | null> {
  appendDebugLog("worktree-state", `getWorktree ${_branch}`);
  return null;
}

export async function listSessions(
  _access: WorktreeStateAccess,
): Promise<import("../../temporal/contracts").SessionRecord[]> {
  // Session registry retired.
  return [];
}

export function inferChangeIdFromBranch(branch: string): string | undefined {
  if (!branch.startsWith(CHANGE_BRANCH_PREFIX)) return undefined;
  const suffix = branch.slice(CHANGE_BRANCH_PREFIX.length);
  return suffix.length > 0 ? suffix : undefined;
}

// =============================================================================
// VISIBILITY QUERIES (cross-change worktree discovery)
// =============================================================================

export function buildWorktreeBranchVisibilityQuery(
  projectId: string,
  branch: string,
): string {
  return [
    `AdvAffectedProjects = "${escapeVisibilityValue(projectId)}"`,
    `AdvWorktreeBranches = "${escapeVisibilityValue(branch)}"`,
    `AdvChangeStatus = "active"`,
  ].join(" AND ");
}

export async function listChangeIdsByWorktreeBranch(
  client: WorkflowListClient,
  projectId: string,
  branch: string,
): Promise<string[]> {
  const query = buildWorktreeBranchVisibilityQuery(projectId, branch);
  const list = client.workflow.list;
  if (!list) return [];

  const ids: string[] = [];
  const prefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  for await (const wf of list.call(client.workflow, { query })) {
    if (!wf.workflowId.startsWith(prefix)) continue;
    const changeId = wf.workflowId.slice(prefix.length);
    if (!changeId) continue;
    ids.push(changeId);
  }
  return ids;
}

export async function findBranchOwnersAcrossChanges(
  access: WorktreeStateAccess,
  branch: string,
  excludeChangeId?: string,
): Promise<string[]> {
  const bundle = getService();
  if (!bundle) return [];
  const owners = await listChangeIdsByWorktreeBranch(
    bundle.client as WorkflowListClient,
    access.projectId,
    branch,
  );
  return owners.filter((id) => id !== excludeChangeId);
}

export function buildActiveWorktreeChangesVisibilityQuery(
  projectId: string,
): string {
  return [
    `AdvAffectedProjects = "${escapeVisibilityValue(projectId)}"`,
    `AdvChangeStatus IN ("draft", "pending", "active")`,
  ].join(" AND ");
}

async function listChangeIdsWithActiveWorktrees(
  client: WorkflowListClient,
  projectId: string,
): Promise<string[]> {
  const list = client.workflow.list;
  if (!list) return [];
  const query = buildActiveWorktreeChangesVisibilityQuery(projectId);
  const prefix = `${CHANGE_WORKFLOW_PREFIX}${projectId}/`;
  const ids: string[] = [];
  for await (const wf of list.call(client.workflow, { query })) {
    if (!wf.workflowId.startsWith(prefix)) continue;
    const changeId = wf.workflowId.slice(prefix.length);
    if (changeId) ids.push(changeId);
  }
  return ids;
}

function materializeChangeWorktreeRecord(
  changeId: string,
  branch: string,
  record: WorktreeRecord,
): MaterializedWorktreeRecord | null {
  if (record.status === "deleted") return null;
  if (!record.path) return null;
  return {
    ...record,
    changeId,
    branch,
    status: "active",
    path: record.path,
    materialized: true,
  };
}

export async function listWorktreesAcrossChanges(
  access: WorktreeStateAccess,
): Promise<MaterializedWorktreeRecord[] | null> {
  const bundle = getService();
  if (!bundle) return null;
  const client = bundle.client as WorkflowListClient & {
    workflow: WorkflowListClient["workflow"] & {
      getHandle?: (workflowId: string) => {
        query: (def: unknown, ...args: unknown[]) => Promise<unknown>;
      };
    };
  };
  if (!client.workflow.list || !client.workflow.getHandle) return null;

  const changeIds = await listChangeIdsWithActiveWorktrees(
    client,
    access.projectId,
  );
  const records: MaterializedWorktreeRecord[] = [];
  for (const changeId of changeIds) {
    const handle = client.workflow.getHandle(
      `${CHANGE_WORKFLOW_PREFIX}${access.projectId}/${changeId}`,
    );
    const worktrees = (await handle.query(getWorktreesQuery)) as NonNullable<
      import("../../temporal/contracts").ChangeWorkflowState["worktrees"]
    >;
    for (const [branch, record] of Object.entries(worktrees ?? {})) {
      const materialized = materializeChangeWorktreeRecord(
        changeId,
        branch,
        record as WorktreeRecord,
      );
      if (materialized) records.push(materialized);
    }
  }
  return records;
}

// =============================================================================
// STUB EXPORTS for back-compat with consumers not yet rewritten
// =============================================================================

export async function getSessionRecord(
  _access: WorktreeStateAccess,
  _sessionId: string,
): Promise<SessionRecord | null> {
  return null;
}

export async function getWorktreeRecord(
  _access: WorktreeStateAccess,
  _branch: string,
): Promise<Worktree | null> {
  return null;
}

export async function getWorktreePath(
  projectRoot: string,
  branch: string,
): Promise<string> {
  const projectId = await getProjectIdRaw(projectRoot);
  if (!projectId) {
    throw new Error(
      `getWorktreePath: unable to resolve project id for ${projectRoot}`,
    );
  }
  return join(getWorktreeBase(projectId), branch);
}

export async function updateWorktreeRecord(
  _access: WorktreeStateAccess,
  _update: {
    branch: string;
    status?: WorktreeRecord["status"];
    path?: string;
    materialized?: boolean;
    changeId?: string | null;
    baseRef?: string;
    headSha?: string;
    source?: WorktreeRecord["source"];
    now?: string;
    sourceVersion?: number;
    setupReady?: boolean;
    setupFailureReason?: string;
    merged?: boolean;
    cleanupEligible?: boolean;
    cleanupBlockedBy?: string[];
  },
): Promise<void> {
  // no-op until per-change workflow integration
}

export async function getChangeSummaries(
  _access: WorktreeStateAccess,
): Promise<Record<string, { touched_files?: string[]; status?: string }>> {
  return {};
}
