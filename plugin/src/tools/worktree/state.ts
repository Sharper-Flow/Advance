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
 * - rq-worktreePoisonVisibility01 (cross-change worktree query poison isolation)
 *
 * Session registry retired: sessions are process-fact based only.
 * Pending deletes are durable via external JSONL under
 * `$XDG_DATA_HOME/opencode/plugins/advance/{projectId}/`.
 */

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  assertPathInsideDirectory,
  getExternalRoot,
  getWorktreeBase,
} from "../../utils/project-id";
import type {
  PendingWorktreeDelete,
  SessionRecord,
  WorktreeRecord,
  MaterializedWorktreeRecord,
  ChangeWorkflowState,
} from "../../temporal/contracts";
import type { OpencodeClient } from "../../utils/opencode-types";
import { appendDebugLog } from "../../utils/debug-log";
import { getProjectId as getProjectIdRaw } from "../../utils/project-id";
import { getStateQuery } from "../../temporal/messages";
import { getService } from "../../temporal/service";
import { acquireFileLock, atomicWriteFile } from "../../utils/fs";
import { collectErrorText } from "../../temporal/error-text";
import {
  isPoisonedHistoryError,
  isWorkflowCompletedError,
} from "../../temporal/recovery-classification";
import { workflowPoisonedDescriptionEvidence } from "../recovery-probe";

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
  lastError?: string;
  lastErrorClass?: string;
}

export interface PendingDeleteSummary {
  total: number;
  classes: Record<string, number>;
}

export type WorktreeWorkflowRecoveryReason =
  | "poisoned_history"
  | "missing_workflow";

export interface WorktreeCrossChangeWarning {
  source: "worktree_visibility" | "worktree_workflow";
  message: string;
  errorClass: string;
  changeId?: string;
  workflowId?: string;
  recoveryReason?: WorktreeWorkflowRecoveryReason;
  evidenceSummary?: string;
}

export interface WorktreePoisonedWorkflowEntry {
  changeId: string;
  workflowId: string;
  recoveryReason: "poisoned_history";
  evidenceSummary: string;
  message: string;
}

export interface WorktreesAcrossChangesResult {
  records: MaterializedWorktreeRecord[];
  warnings: WorktreeCrossChangeWarning[];
  poisonedWorkflows: WorktreePoisonedWorkflowEntry[];
  unavailable?: boolean;
}

export interface WorktreeRegistrySnapshot extends WorktreesAcrossChangesResult {
  changeSummaries: Record<
    string,
    { branch?: string; touched_files?: string[]; status?: string }
  >;
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

function setupReadyFromRecord(r: WorktreeRecord): boolean | undefined {
  if (typeof r.setupReady === "boolean") return r.setupReady;

  // Back-compat for change-workflow records written before
  // applyWorktreeCreatedToState stamped setupReady:true. In that map,
  // status:"created" is produced only by worktreeCreatedSignal, which fires
  // after setup succeeds. Preserve explicit false and missing-path records.
  if (r.status === "created" && typeof r.path === "string" && r.path) {
    return true;
  }

  return undefined;
}

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
    setupReady: setupReadyFromRecord(r),
    setupFailureReason: r.setupFailureReason,
    dirty: r.dirty,
    merged: r.merged,
    cleanupEligible: r.cleanupEligible,
    cleanupBlockedBy: r.cleanupBlockedBy,
    pendingDelete: r.pendingDelete,
  };
}

function _recordToPending(r: PendingWorktreeDelete): PendingDelete {
  const record = r as PendingWorktreeDelete & {
    lastError?: unknown;
    lastErrorClass?: unknown;
  };
  return {
    branch: r.branch,
    path: r.path,
    reason: r.reason,
    recordedAt: r.recordedAt,
    attempts: r.attempts,
    ...(typeof record.lastError === "string"
      ? { lastError: record.lastError }
      : {}),
    ...(typeof record.lastErrorClass === "string"
      ? { lastErrorClass: record.lastErrorClass }
      : {}),
  };
}

const CHANGE_BRANCH_PREFIX = "change/";
const CHANGE_WORKFLOW_PREFIX = "adv/change/";
const PENDING_DELETES_FILE = "worktree-pending-deletes.json";
const MAX_WORKTREE_ERROR_EVIDENCE_CHARS = 500;

type ChangeWorkflowWorktreeHandle = {
  query: (def: unknown, ...args: unknown[]) => Promise<unknown>;
  describe?: () => Promise<unknown>;
};

function errorClass(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return typeof error;
}

function summarizeErrorEvidence(error: unknown): string | undefined {
  const text = collectErrorText(error).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  if (text.length <= MAX_WORKTREE_ERROR_EVIDENCE_CHARS) return text;
  return `${text.slice(0, MAX_WORKTREE_ERROR_EVIDENCE_CHARS - 1)}…`;
}

async function classifyWorktreeWorkflowFailure(
  handle: ChangeWorkflowWorktreeHandle,
  error: unknown,
): Promise<{
  recoveryReason?: WorktreeWorkflowRecoveryReason;
  evidenceSummary?: string;
}> {
  const describeEvidence = await workflowPoisonedDescriptionEvidence(handle);
  if (describeEvidence) {
    return {
      recoveryReason: "poisoned_history",
      evidenceSummary: describeEvidence,
    };
  }
  if (isPoisonedHistoryError(error)) {
    return {
      recoveryReason: "poisoned_history",
      evidenceSummary: summarizeErrorEvidence(error),
    };
  }
  if (isWorkflowCompletedError(error)) {
    return {
      recoveryReason: "missing_workflow",
      evidenceSummary: summarizeErrorEvidence(error),
    };
  }
  return { evidenceSummary: summarizeErrorEvidence(error) };
}

function escapeVisibilityValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pendingDeletesPath(access: WorktreeStateAccess): string {
  return join(getExternalRoot(access.projectId), PENDING_DELETES_FILE);
}

function isPendingDelete(value: unknown): value is PendingDelete {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.branch === "string" &&
    typeof record.path === "string" &&
    typeof record.reason === "string" &&
    typeof record.recordedAt === "string" &&
    typeof record.attempts === "number" &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 0 &&
    (record.lastError === undefined || typeof record.lastError === "string") &&
    (record.lastErrorClass === undefined ||
      typeof record.lastErrorClass === "string")
  );
}

async function readPendingDeletes(
  access: WorktreeStateAccess,
): Promise<PendingDelete[]> {
  try {
    const raw = await readFile(pendingDeletesPath(access), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingDelete);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writePendingDeletes(
  access: WorktreeStateAccess,
  pendingDeletes: PendingDelete[],
): Promise<void> {
  const file = pendingDeletesPath(access);
  await mkdir(dirname(file), { recursive: true });
  await atomicWriteFile(file, `${JSON.stringify(pendingDeletes, null, 2)}\n`);
}

/**
 * Serialize pending-delete read-modify-write through a per-file lock so peer
 * sessions racing on the same project state directory cannot lose updates.
 * Mirrors the pattern used by `storage/project-metadata.ts` and
 * `storage/project-wisdom.ts`.
 */
async function withPendingDeleteLock<T>(
  access: WorktreeStateAccess,
  fn: () => Promise<T>,
): Promise<T> {
  const file = pendingDeletesPath(access);
  await mkdir(dirname(file), { recursive: true });
  const release = await acquireFileLock(file);
  try {
    return await fn();
  } finally {
    await release();
  }
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
  access: WorktreeStateAccess,
  branch: string,
  path: string,
  reason: string,
  now?: string,
): Promise<void> {
  await withPendingDeleteLock(access, async () => {
    const pendingDeletes = await readPendingDeletes(access);
    const existing = pendingDeletes.find((entry) => entry.branch === branch);
    const next: PendingDelete = {
      branch,
      path,
      reason,
      recordedAt: existing?.recordedAt ?? now ?? new Date().toISOString(),
      attempts: existing?.attempts ?? 0,
      lastError: existing?.lastError,
      lastErrorClass: existing?.lastErrorClass,
    };
    await writePendingDeletes(access, [
      ...pendingDeletes.filter((entry) => entry.branch !== branch),
      next,
    ]);
  });
}

export async function getPendingDeletes(
  access: WorktreeStateAccess,
): Promise<PendingDelete[]> {
  return readPendingDeletes(access);
}

export function classifyPendingDelete(
  entry: Pick<PendingDelete, "reason" | "lastErrorClass">,
): string {
  if (entry.lastErrorClass) return entry.lastErrorClass;
  const reason = entry.reason.toLowerCase();
  if (reason.includes("in use")) return "worktree_in_use";
  if (reason.includes("terminal cleanup discovered")) {
    return "terminal_cleanup_discovered";
  }
  if (reason.includes("uncommitted") || reason.includes("dirty")) {
    return "dirty_worktree";
  }
  if (reason.includes("merged") || reason.includes("unmerged")) {
    return "branch_not_merged";
  }
  return "other";
}

export function summarizePendingDeletes(
  pendingDeletes: PendingDelete[],
): PendingDeleteSummary {
  const classes: Record<string, number> = {};
  for (const entry of pendingDeletes) {
    const klass = classifyPendingDelete(entry);
    classes[klass] = (classes[klass] ?? 0) + 1;
  }
  return { total: pendingDeletes.length, classes };
}

export async function incrementPendingDeleteAttempts(
  access: WorktreeStateAccess,
  branch: string,
): Promise<void> {
  await withPendingDeleteLock(access, async () => {
    const pendingDeletes = await readPendingDeletes(access);
    await writePendingDeletes(
      access,
      pendingDeletes.map((entry) =>
        entry.branch === branch
          ? { ...entry, attempts: entry.attempts + 1 }
          : entry,
      ),
    );
  });
}

export async function recordPendingDeleteFailure(
  access: WorktreeStateAccess,
  branch: string,
  lastError: string,
  lastErrorClass: string,
): Promise<void> {
  await withPendingDeleteLock(access, async () => {
    const pendingDeletes = await readPendingDeletes(access);
    await writePendingDeletes(
      access,
      pendingDeletes.map((entry) =>
        entry.branch === branch
          ? {
              ...entry,
              attempts: entry.attempts + 1,
              lastError,
              lastErrorClass,
            }
          : entry,
      ),
    );
  });
}

export async function clearPendingDelete(
  access: WorktreeStateAccess,
  branch: string,
): Promise<void> {
  await withPendingDeleteLock(access, async () => {
    const pendingDeletes = await readPendingDeletes(access);
    await writePendingDeletes(
      access,
      pendingDeletes.filter((entry) => entry.branch !== branch),
    );
  });
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
  access: WorktreeStateAccess,
): Promise<Worktree[]> {
  const snapshot = await getWorktreeRegistrySnapshot(access);
  return snapshot.records as Worktree[];
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
    `AdvWorktreeBranches IS NOT NULL`,
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

function collectTouchedFilesFromState(state: ChangeWorkflowState): string[] {
  const touched = new Set<string>();
  for (const task of state.tasks ?? []) {
    for (const file of task.touched_files ?? task.filesTouched ?? []) {
      if (typeof file === "string" && file.length > 0) touched.add(file);
    }
  }
  return [...touched];
}

export async function listWorktreesAcrossChanges(
  access: WorktreeStateAccess,
): Promise<WorktreesAcrossChangesResult> {
  const snapshot = await getWorktreeRegistrySnapshot(access);
  return {
    records: snapshot.records,
    warnings: snapshot.warnings,
    poisonedWorkflows: snapshot.poisonedWorkflows,
    ...(snapshot.unavailable ? { unavailable: true as const } : {}),
  };
}

export async function getWorktreeRegistrySnapshot(
  access: WorktreeStateAccess,
): Promise<WorktreeRegistrySnapshot> {
  const unavailable = (message: string, error?: unknown) => ({
    records: [],
    changeSummaries: {},
    warnings: [
      {
        source: "worktree_visibility" as const,
        message,
        errorClass: error ? errorClass(error) : "Unavailable",
        ...(error ? { evidenceSummary: summarizeErrorEvidence(error) } : {}),
      },
    ],
    poisonedWorkflows: [],
    unavailable: true,
  });

  const bundle = getService();
  if (!bundle) return unavailable("Temporal service unavailable");
  const client = bundle.client as WorkflowListClient & {
    workflow: WorkflowListClient["workflow"] & {
      getHandle?: (workflowId: string) => ChangeWorkflowWorktreeHandle;
    };
  };
  if (!client.workflow.list || !client.workflow.getHandle) {
    return unavailable("Temporal workflow list/getHandle unavailable");
  }

  let changeIds: string[];
  try {
    changeIds = await listChangeIdsWithActiveWorktrees(
      client,
      access.projectId,
    );
  } catch (error) {
    return unavailable("Unable to list active worktree workflows", error);
  }

  const records: MaterializedWorktreeRecord[] = [];
  const warnings: WorktreeCrossChangeWarning[] = [];
  const poisonedWorkflows: WorktreePoisonedWorkflowEntry[] = [];
  const changeSummaries: WorktreeRegistrySnapshot["changeSummaries"] = {};

  for (const listedChangeId of changeIds) {
    const workflowId = `${CHANGE_WORKFLOW_PREFIX}${access.projectId}/${listedChangeId}`;
    const handle = client.workflow.getHandle(workflowId);
    let state: ChangeWorkflowState;
    try {
      state = (await handle.query(getStateQuery)) as ChangeWorkflowState;
    } catch (error) {
      const classification = await classifyWorktreeWorkflowFailure(
        handle,
        error,
      );
      const message = `Unable to query worktree registry snapshot for change ${listedChangeId}`;
      warnings.push({
        source: "worktree_workflow",
        changeId: listedChangeId,
        workflowId,
        message,
        errorClass: errorClass(error),
        ...(classification.recoveryReason
          ? { recoveryReason: classification.recoveryReason }
          : {}),
        ...(classification.evidenceSummary
          ? { evidenceSummary: classification.evidenceSummary }
          : {}),
      });
      if (
        classification.recoveryReason === "poisoned_history" &&
        classification.evidenceSummary
      ) {
        poisonedWorkflows.push({
          changeId: listedChangeId,
          workflowId,
          recoveryReason: "poisoned_history",
          evidenceSummary: classification.evidenceSummary,
          message,
        });
      }
      continue;
    }

    const changeId = state.changeId ?? listedChangeId;
    const touchedFiles = collectTouchedFilesFromState(state);
    changeSummaries[changeId] = {
      ...(typeof state.status === "string" ? { status: state.status } : {}),
      ...(touchedFiles.length > 0 ? { touched_files: touchedFiles } : {}),
    };

    const worktreeEntries = Object.entries(state.worktrees ?? {}).sort(
      ([left], [right]) => left.localeCompare(right),
    );
    for (const [branch, record] of worktreeEntries) {
      const materialized = materializeChangeWorktreeRecord(
        changeId,
        branch,
        record as WorktreeRecord,
      );
      if (materialized) {
        records.push(materialized);
        const isCanonicalChangeBranch = branch === `change/${changeId}`;
        changeSummaries[changeId] = {
          ...changeSummaries[changeId],
          branch:
            changeSummaries[changeId]?.branch && !isCanonicalChangeBranch
              ? changeSummaries[changeId].branch
              : branch,
        };
      }
    }
  }

  return { records, changeSummaries, warnings, poisonedWorkflows };
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

/**
 * Read a single worktree record for `branch` from the durable change-workflow
 * `worktrees` map. This is the structural authority for "does a worktree exist
 * for this change" used by the worktree-isolation guard (rq-worktreeMutationGuard01)
 * and by `advWorktreeResume`'s reuse path — never heuristic filesystem inference (P33).
 *
 * Returns the `Worktree` (including `status`, `path`, `materialized`, `setupReady`,
 * `setupFailureReason`) or `null` when the branch is not a change branch, the
 * Temporal service is unavailable, the workflow query fails, or no record exists.
 * On unavailability it returns `null` (callers treat unknown existence as
 * "no worktree" and fall back to their own safety posture).
 */
export async function getWorktreeRecord(
  access: WorktreeStateAccess,
  branch: string,
): Promise<Worktree | null> {
  const changeId = inferChangeIdFromBranch(branch);
  if (!changeId) return null;

  const bundle = getService();
  if (!bundle) return null;
  const client = bundle.client as {
    workflow?: {
      getHandle?: (workflowId: string) => ChangeWorkflowWorktreeHandle;
    };
  };
  const getHandle = client.workflow?.getHandle;
  if (!getHandle) return null;

  const workflowId = `${CHANGE_WORKFLOW_PREFIX}${access.projectId}/${changeId}`;
  let state: ChangeWorkflowState | undefined;
  try {
    const handle = getHandle(workflowId);
    state = (await handle.query(getStateQuery)) as ChangeWorkflowState;
  } catch {
    // Unknown existence (poisoned/unreachable workflow): do not assert a worktree.
    return null;
  }
  if (!state || typeof state !== "object") return null;

  const record = (state.worktrees ?? {})[branch] as WorktreeRecord | undefined;
  if (!record) return null;

  const worktree = _recordToWorktree(record);
  worktree.branch = branch;
  worktree.changeId = state.changeId ?? changeId;
  if (typeof record.materialized === "boolean") {
    worktree.materialized = record.materialized;
  }
  return worktree;
}

/**
 * Read-only, side-effect-free probe: does a *setup-ready* ADV worktree exist for
 * `changeId`? Used by the worktree-isolation guard to ALLOW state-transition
 * mutations from main when isolation already exists (rq-worktreeMutationGuard01.4).
 *
 * Setup-ready predicate (GFD-2): status is neither `deleted` nor `setup_failed`,
 * `setupReady === true`, and `path` is present. A `setup_failed`/`setupReady:false`
 * record does NOT qualify. Returns `false` on any unavailability — never ALLOW on
 * unknown existence.
 */
export async function worktreeExistsForChange(
  access: WorktreeStateAccess,
  changeId: string,
): Promise<boolean> {
  const branch = `${CHANGE_BRANCH_PREFIX}${changeId}`;
  let record: Worktree | null;
  try {
    record = await getWorktreeRecord(access, branch);
  } catch {
    return false;
  }
  if (!record) return false;
  return (
    record.status !== "deleted" &&
    record.status !== "setup_failed" &&
    record.setupReady === true &&
    !!record.path
  );
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
  const base = getWorktreeBase(projectId);
  const worktreePath = join(base, branch);
  assertPathInsideDirectory(worktreePath, base);
  return worktreePath;
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
  access: WorktreeStateAccess,
): Promise<
  Record<string, { branch?: string; touched_files?: string[]; status?: string }>
> {
  const snapshot = await getWorktreeRegistrySnapshot(access);
  return snapshot.changeSummaries;
}
