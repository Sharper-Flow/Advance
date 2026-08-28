/**
 * Worktree state and durable pending-delete records.
 *
 * Worktree records are a projection of the local Git worktree/branch facts.
 * Pending deletes remain durable external state under
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
  WorktreeRecord,
  MaterializedWorktreeRecord,
} from "../../types";
import { execFileGitAsync } from "../../utils/git-binary";
import { parseWorktreeListPorcelain } from "./porcelain-parser";
import { inferChangeIdFromBranch } from "./branch-parser";
import { getDefaultBranch } from "../../utils/git";
import { scanGitWorkspaceFacts, reconcileWorktreeRegistry } from "./census";
import { getProjectId as getProjectIdRaw } from "../../utils/project-id";
import { acquireFileLock, atomicWriteFile } from "../../utils/fs";
import {
  createInventoryBudget,
  type InventoryBudget,
  type InventoryStopReason,
} from "./inventory-budget";

// =============================================================================
// TYPES — back-compat wrappers around the new contracts.
// =============================================================================

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
export interface PendingDeleteAuthority {
  changeId?: string;
  terminalStatus?: "archived" | "closed";
  terminalProof?:
    | "store"
    | "registry_snapshot"
    | "archive_repair_archived_list"
    | "manual_pr_recovery";
  mergeProof?: {
    kind: string;
    [key: string]: string | number | boolean | undefined;
  };
  recordedAt: string;
}

export interface PendingDelete {
  branch: string;
  path: string;
  reason: string;
  recordedAt: string;
  attempts: number;
  lastError?: string;
  lastErrorClass?: string;
  authority?: PendingDeleteAuthority;
}

export interface PendingDeleteSummary {
  total: number;
  classes: Record<string, number>;
}

export interface WorktreesAcrossChangesResult {
  records: MaterializedWorktreeRecord[];
  unavailable?: boolean;
}

export interface WorktreeRegistrySnapshot extends WorktreesAcrossChangesResult {
  changeSummaries: Record<
    string,
    { branch?: string; touched_files?: string[]; status?: string }
  >;
  complete?: boolean;
  stopReason?: InventoryStopReason;
  stoppedStage?: string;
  inspectedCount?: number;
  candidateCount?: number;
  omitted?: Array<{
    scope: string;
    changeId?: string;
    branch?: string;
    reason: string;
  }>;
  stageTimings?: Record<string, number>;
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

  // Git census records with a materialized path are setup-ready unless an
  // explicit failure marker says otherwise.
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

const PENDING_DELETES_FILE = "worktree-pending-deletes.json";
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
      typeof record.lastErrorClass === "string") &&
    (record.authority === undefined ||
      (typeof record.authority === "object" && record.authority !== null))
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
// PENDING DELETE LIFECYCLE (external JSONL)
// =============================================================================

export async function setPendingDelete(
  access: WorktreeStateAccess,
  branch: string,
  path: string,
  reason: string,
  now?: string,
  authority?: PendingDeleteAuthority,
  lastErrorClass?: string,
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
      lastErrorClass: lastErrorClass ?? existing?.lastErrorClass,
      authority: authority ?? existing?.authority,
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
  if (reason.includes("ownership uncertain")) {
    return "workspace_ownership_uncertain";
  }
  if (reason.includes("workspace cleanup failed")) {
    return "workspace_cleanup_failed";
  }
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

export async function listWorktrees(
  access: WorktreeStateAccess,
): Promise<Worktree[]> {
  const snapshot = await getWorktreeRegistrySnapshot(access);
  return snapshot.records as Worktree[];
}

/** Return change branches currently attached to a local Git worktree. */
export async function findBranchOwnersAcrossChanges(
  access: WorktreeStateAccess,
  branch: string,
  excludeChangeId?: string,
): Promise<string[]> {
  const { stdout } = await execFileGitAsync(
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: access.projectDir, timeout: 10_000 },
  );
  const owner = inferChangeIdFromBranch(branch);
  if (!owner || owner === excludeChangeId) return [];
  return parseWorktreeListPorcelain(stdout).some(
    (entry) => entry.branch === branch,
  )
    ? [owner]
    : [];
}

export async function listWorktreesAcrossChanges(
  access: WorktreeStateAccess,
  options?: {
    budget?: InventoryBudget;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<WorktreeRegistrySnapshot> {
  const snapshot = await getWorktreeRegistrySnapshot(access, {
    budget: options?.budget,
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
  });
  return snapshot;
}

export async function getWorktreeRegistrySnapshot(
  access: WorktreeStateAccess,
  options?: {
    budget?: InventoryBudget;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<WorktreeRegistrySnapshot> {
  let ownBudget: InventoryBudget | undefined;
  let budget = options?.budget;
  if (!budget && (options?.signal || options?.timeoutMs !== undefined)) {
    ownBudget = createInventoryBudget({
      callerSignal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    budget = ownBudget;
  }

  const startedAt = performance.now();
  const emptyResult = (message?: string): WorktreeRegistrySnapshot => ({
    records: [],
    changeSummaries: {},
    unavailable: Boolean(message),
    complete: false,
    stopReason: budget?.snapshot().stopReason,
    stoppedStage: message ? "git_census" : undefined,
    inspectedCount: 0,
    candidateCount: 0,
    stageTimings: {
      git_census: Number((performance.now() - startedAt).toFixed(3)),
    },
  });

  try {
    if (budget && !budget.canStartInspection()) return emptyResult();
    const defaultBranch = await getDefaultBranch(access.projectDir);
    const facts = await scanGitWorkspaceFacts(
      access.projectDir,
      defaultBranch,
      options?.timeoutMs,
    );
    const now = new Date().toISOString();
    const records = reconcileWorktreeRegistry({
      existing: [],
      git: facts,
      sessions: [],
      defaultBranch,
      now,
      sourceVersion: Date.now(),
    }).filter((record): record is MaterializedWorktreeRecord =>
      Boolean(record.path),
    );
    const changeSummaries: WorktreeRegistrySnapshot["changeSummaries"] = {};
    for (const record of records) {
      const changeId = record.changeId;
      if (changeId) {
        changeSummaries[changeId] = {
          branch: record.branch,
        };
      }
    }
    const snapshot = budget?.snapshot();
    return {
      records,
      changeSummaries,
      complete: snapshot?.complete ?? true,
      stopReason: snapshot?.stopReason,
      inspectedCount: records.length,
      candidateCount: facts.branches.length + facts.worktrees.length,
      stageTimings: {
        git_census: Number((performance.now() - startedAt).toFixed(3)),
      },
    };
  } catch (error) {
    return emptyResult(
      `Unable to read local worktree state: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    ownBudget?.dispose();
  }
}

/** Read a worktree record from the local Git census. */
export async function getWorktreeRecord(
  access: WorktreeStateAccess,
  branch: string,
): Promise<Worktree | null> {
  const changeId = inferChangeIdFromBranch(branch);
  if (!changeId) return null;
  try {
    const snapshot = await getWorktreeRegistrySnapshot(access);
    const record = snapshot.records.find((entry) => entry.branch === branch);
    if (!record) return null;
    const worktree = _recordToWorktree(record);
    worktree.changeId = record.changeId ?? changeId;
    return worktree;
  } catch {
    return null;
  }
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
  const branch = `change/${changeId}`;
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

export async function getChangeSummaries(
  access: WorktreeStateAccess,
): Promise<
  Record<string, { branch?: string; touched_files?: string[]; status?: string }>
> {
  const snapshot = await getWorktreeRegistrySnapshot(access);
  return snapshot.changeSummaries;
}
