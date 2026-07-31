/**
 * Exact-batch directory-only worktree detach (rq-migrateExistingAdvWorktrees).
 *
 * Distinct from terminal cleanup: removes only the worktree directory, preserves
 * the local branch and ADV change record, and writes a durable dematerialize
 * receipt on the owning change workflow. Never invoked by reapers, triage,
 * startup cleanup, or migration automation.
 */

import { createHash } from "node:crypto";
import * as path from "node:path";

import { execFileGitAsync, execFileGitCb } from "../../utils/git-binary";
import { getService } from "../../temporal/service";
import {
  getStateQuery,
  worktreeDematerializedSignal,
} from "../../temporal/messages";
import { getChangeHandle, fireSignalAndRefresh } from "../_adapters";
import { withTimeout, TimeoutError } from "../../utils/with-timeout";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
} from "../../utils/git-worktree-flock";
import {
  getWorktreeRecord,
  inferChangeIdFromBranch,
  type WorktreeStateAccess,
} from "./state";
import { isWorktreeInUse } from "./in-use";
import { getProjectId, getExternalRoot } from "../../utils/project-id";
import type { Store } from "../../storage/store";
import type { ChangeWorkflowState } from "../../temporal/contracts";
import { CHANGE_BRANCH_PREFIX } from "../../temporal/contracts";
import type { WorktreeDematerializedSignalPayload } from "../../types";
import type { WorkerLockResult } from "../../temporal/worker-lock";

// =============================================================================
// TYPES
// =============================================================================

interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface AdvWorktreeDetachBatchArgs {
  /** Exact branch identifiers. No globbing or age inference. */
  branches: string[];
  /** Positive staleness cutoff in milliseconds. */
  cutoffMs: number;
  mode: "dry_run" | "apply";
  /** Required for apply; ignored for dry_run. */
  approvalEvidence?: string;
  /** Deterministic id bound to the normalized branch set + cutoff. */
  requestId?: string;
}

export interface WorktreeDetachDisposition {
  branch: string;
  path?: string;
  eligible: boolean;
  refusalReason?: string;
  outcome?: "detached" | "refused" | "idempotent_already_detached";
}

export type AdvWorktreeDetachBatchResult =
  | {
      ok: true;
      requestId: string;
      mode: "dry_run" | "apply";
      dispositions: WorktreeDetachDisposition[];
      warnings?: string[];
    }
  | {
      ok: false;
      reason: string;
      requestId?: string;
      dispositions: WorktreeDetachDisposition[];
    };

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_DETACH_SIGNAL_TIMEOUT_MS = 5_000;
const GIT_WORKTREE_REMOVE_TIMEOUT_MS = 5_000;

// =============================================================================
// REQUEST IDENTITY
// =============================================================================

function deriveRequestId(branches: string[], cutoffMs: number): string {
  const payload = JSON.stringify({
    branches: [...branches].sort((a, b) => a.localeCompare(b)),
    cutoffMs,
  });
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `wdet-${hash}`;
}

// =============================================================================
// GIT HELPERS
// =============================================================================

interface GitWorktreeEntry {
  path: string;
  branch?: string;
  headSha?: string;
}

function parseGitWorktreePorcelain(output: string): GitWorktreeEntry[] {
  const entries: GitWorktreeEntry[] = [];
  let current: GitWorktreeEntry | null = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) entries.push(current);
      current = { path: line.slice("worktree ".length) };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    } else if (line.startsWith("HEAD ")) {
      current.headSha = line.slice("HEAD ".length);
    }
  }
  if (current) entries.push(current);
  return entries;
}

async function listGitWorktreeEntries(
  repoRoot: string,
): Promise<GitWorktreeEntry[]> {
  const { stdout } = await execFileGitAsync(
    ["worktree", "list", "--porcelain"],
    { cwd: repoRoot, timeout: 10_000 },
  );
  return parseGitWorktreePorcelain(stdout);
}

async function getBranchActivityAt(
  repoRoot: string,
  branch: string,
): Promise<string | undefined> {
  try {
    const { stdout } = await execFileGitAsync(
      ["log", "-1", "--format=%cI", branch],
      { cwd: repoRoot, timeout: 10_000 },
    );
    const trimmed = stdout.trim();
    return trimmed || undefined;
  } catch {
    return undefined;
  }
}

async function detectDirty(
  worktreePath: string,
): Promise<{ clean: boolean; files: string[] }> {
  try {
    const { stdout } = await execFileGitAsync(["status", "--porcelain"], {
      cwd: worktreePath,
      timeout: 10_000,
    });
    const files = stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return { clean: files.length === 0, files };
  } catch {
    return { clean: false, files: ["git-status-failed"] };
  }
}

function gitWorktreeRemove(
  repoRoot: string,
  worktreePath: string,
  timeoutMs: number = GIT_WORKTREE_REMOVE_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    execFileGitCb(
      ["worktree", "remove", worktreePath],
      {
        cwd: repoRoot,
        timeout: Math.max(1, timeoutMs),
        killSignal: "SIGKILL",
      },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            reason:
              stderr.trim() || error.message || "git worktree remove failed",
          });
        } else {
          resolve({ ok: true });
        }
      },
    );
  });
}

function gitWorktreeAdd(
  repoRoot: string,
  worktreePath: string,
  branch: string,
  timeoutMs: number = GIT_WORKTREE_REMOVE_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return new Promise((resolve) => {
    execFileGitCb(
      ["worktree", "add", worktreePath, branch],
      {
        cwd: repoRoot,
        timeout: Math.max(1, timeoutMs),
        killSignal: "SIGKILL",
      },
      (error, _stdout, stderr) => {
        if (error) {
          resolve({
            ok: false,
            reason: stderr.trim() || error.message || "git worktree add failed",
          });
        } else {
          resolve({ ok: true });
        }
      },
    );
  });
}

// =============================================================================
// WORKFLOW STATE HELPERS
// =============================================================================

async function getChangeWorkflowState(
  access: WorktreeStateAccess,
  changeId: string,
): Promise<ChangeWorkflowState | null> {
  const bundle = getService();
  if (!bundle) return null;
  const workflowApi = bundle.client.workflow as {
    getHandle?: (workflowId: string) => {
      query: (def: unknown) => Promise<unknown>;
    };
  };
  if (!workflowApi?.getHandle) return null;

  const workflowId = `adv/change/${access.projectId}/${changeId}`;
  try {
    const handle = workflowApi.getHandle(workflowId);
    const state = (await handle.query(getStateQuery)) as ChangeWorkflowState;
    if (!state || typeof state !== "object") return null;
    return state;
  } catch {
    return null;
  }
}

function getAdvActivityAt(
  state: ChangeWorkflowState | null,
  lastSeenAt?: string,
): string | undefined {
  return state?.lastSignalAt ?? lastSeenAt;
}

// =============================================================================
// SIGNAL
// =============================================================================

async function fireDetachSignal(
  projectRoot: string,
  store: Store | undefined,
  changeId: string | undefined,
  payload: WorktreeDematerializedSignalPayload,
  signalTimeoutMs = DEFAULT_DETACH_SIGNAL_TIMEOUT_MS,
): Promise<{ ok: true } | { ok: false; warning: string }> {
  if (!changeId) return { ok: true };

  const bundle = getService();
  if (!bundle) {
    return { ok: false, warning: "Temporal service unavailable" };
  }

  const projectId = await getProjectId(projectRoot);
  if (!projectId) {
    return {
      ok: false,
      warning: `Unable to resolve project id for ${projectRoot}`,
    };
  }

  const handle = getChangeHandle(bundle.client, projectId, changeId);

  try {
    if (store) {
      await withTimeout(
        fireSignalAndRefresh(
          handle,
          store,
          changeId,
          worktreeDematerializedSignal,
          payload,
        ),
        signalTimeoutMs,
        "Worktree dematerialize signal timed out",
      );
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (handle as any).signal(worktreeDematerializedSignal, payload);
    }
    return { ok: true };
  } catch (err) {
    const warning =
      err instanceof TimeoutError
        ? `Worktree dematerialize signal timed out after ${signalTimeoutMs}ms`
        : `Worktree dematerialize signal failed: ${err instanceof Error ? err.message : String(err)}`;
    return { ok: false, warning };
  }
}

// =============================================================================
// PREFLIGHT
// =============================================================================

interface PreflightContext {
  repoRoot: string;
  cutoffAt: number;
  requestId: string;
  log: Logger;
}

interface PreflightResult {
  disposition: WorktreeDetachDisposition;
  changeId: string | undefined;
  recordPath: string | undefined;
  state: ChangeWorkflowState | null;
}

async function preflightBranch(
  branch: string,
  ctx: PreflightContext,
  access: WorktreeStateAccess,
): Promise<PreflightResult> {
  const failure = (reason: string, path?: string): PreflightResult => ({
    changeId: inferChangeIdFromBranch(branch),
    recordPath: path,
    state: null,
    disposition: {
      branch,
      path,
      eligible: false,
      refusalReason: reason,
    },
  });

  if (
    !branch.startsWith(CHANGE_BRANCH_PREFIX) ||
    branch.length === CHANGE_BRANCH_PREFIX.length
  ) {
    return failure("not_a_change_branch");
  }

  const record = await getWorktreeRecord(access, branch);
  if (!record) {
    return failure("missing_or_poisoned_registry");
  }

  const changeId = record.changeId ?? inferChangeIdFromBranch(branch);
  const recordPath = record.path;

  // If already dematerialized, this request can only record a receipt.
  if (
    record.status === "unmaterialized" ||
    record.materialized === false ||
    !recordPath
  ) {
    return {
      changeId,
      recordPath,
      state: null,
      disposition: {
        branch,
        path: recordPath,
        eligible: true,
        outcome: "idempotent_already_detached",
      },
    };
  }

  // Branch-to-path ownership must be unambiguous.
  const gitEntries = (await listGitWorktreeEntries(ctx.repoRoot)).filter(
    (e) => e.branch === `refs/heads/${branch}` || e.branch === branch,
  );
  if (gitEntries.length !== 1) {
    return failure("ambiguous_branch_to_path_ownership", recordPath);
  }
  const gitEntry = gitEntries[0];
  if (path.resolve(gitEntry.path) !== path.resolve(recordPath)) {
    return failure("registry_path_mismatch", recordPath);
  }

  const currentCwd = process.cwd();
  const resolvedPath = path.resolve(recordPath);
  if (
    currentCwd === resolvedPath ||
    currentCwd.startsWith(resolvedPath + path.sep)
  ) {
    return failure("current_cwd", recordPath);
  }

  const inUse = isWorktreeInUse(resolvedPath);
  if (inUse) {
    return failure("active_session_or_in_use", recordPath);
  }

  const dirty = await detectDirty(resolvedPath);
  if (!dirty.clean) {
    return failure("dirty_worktree", recordPath);
  }

  const [branchActivityAt, state] = await Promise.all([
    getBranchActivityAt(ctx.repoRoot, branch),
    getChangeWorkflowState(access, changeId ?? ""),
  ]);

  if (state === null) {
    return failure("workflow_unavailable", recordPath);
  }

  const advActivityAt = getAdvActivityAt(state, record.lastSeenAt);

  const branchTooRecent =
    !branchActivityAt || new Date(branchActivityAt).getTime() > ctx.cutoffAt;
  const advTooRecent =
    !advActivityAt || new Date(advActivityAt).getTime() > ctx.cutoffAt;

  if (branchTooRecent) {
    return failure("branch_activity_too_recent", recordPath);
  }
  if (advTooRecent) {
    return failure("adv_activity_too_recent", recordPath);
  }

  return {
    changeId,
    recordPath,
    state,
    disposition: {
      branch,
      path: recordPath,
      eligible: true,
    },
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

export async function advWorktreeDetachBatch(
  args: AdvWorktreeDetachBatchArgs,
  projectRoot: string,
  database: WorktreeStateAccess,
  options: {
    store?: Store;
    log?: Logger;
    signalTimeoutMs?: number;
  } = {},
): Promise<AdvWorktreeDetachBatchResult> {
  const log = options.log ?? {
    debug: () => {},
    info: () => {},
    warn: (msg: string) => console.warn(msg),
    error: (msg: string) => console.error(msg),
  };

  if (!Number.isFinite(args.cutoffMs) || args.cutoffMs <= 0) {
    return {
      ok: false,
      reason: "cutoffMs must be a positive integer of milliseconds",
      dispositions: [],
    };
  }

  const normalizedBranches = [
    ...new Set(args.branches.map((b) => b.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  if (normalizedBranches.length === 0) {
    return {
      ok: false,
      reason: "branches must contain at least one non-empty branch name",
      dispositions: [],
    };
  }

  const expectedRequestId = deriveRequestId(normalizedBranches, args.cutoffMs);
  const requestId = args.requestId ?? expectedRequestId;
  const requestIdMismatch =
    args.requestId !== undefined && args.requestId !== expectedRequestId;

  const projectId = await getProjectId(projectRoot);
  if (!projectId) {
    return {
      ok: false,
      reason: `Unable to resolve project id for ${projectRoot}`,
      requestId,
      dispositions: normalizedBranches.map((branch) => ({
        branch,
        eligible: false,
        refusalReason: "missing_project_identity",
      })),
    };
  }
  const projectStateDir = getExternalRoot(projectId);

  const cutoffAt = Date.now() - args.cutoffMs;
  const ctx: PreflightContext = {
    repoRoot: projectRoot,
    cutoffAt,
    requestId,
    log,
  };

  let lock: WorkerLockResult;
  try {
    lock = await acquireGitWorktreeFlock(projectStateDir);
  } catch (err) {
    return {
      ok: false,
      reason: `Failed to acquire git-worktree flock: ${err instanceof Error ? err.message : String(err)}`,
      requestId,
      dispositions: normalizedBranches.map((branch) => ({
        branch,
        eligible: false,
        refusalReason: "lock_acquisition_failed",
      })),
    };
  }

  if (!lock.owned) {
    return {
      ok: false,
      reason: "git-worktree flock is held by another session",
      requestId,
      dispositions: normalizedBranches.map((branch) => ({
        branch,
        eligible: false,
        refusalReason: "git_worktree_locked",
      })),
    };
  }

  try {
    // Fail closed when the mutation path cannot record durable receipts.
    if (args.mode === "apply") {
      const bundle = getService();
      const workflowApi = bundle?.client.workflow as {
        getHandle?: (workflowId: string) => unknown;
      };
      if (!bundle || !workflowApi?.getHandle) {
        return {
          ok: false,
          reason:
            "Temporal service unavailable; cannot record detach receipts or proceed with Git removal",
          requestId,
          dispositions: normalizedBranches.map((branch) => ({
            branch,
            eligible: false,
            refusalReason: "workflow_unavailable",
          })),
        };
      }
    }

    const preflightResults: PreflightResult[] = [];
    for (const branch of normalizedBranches) {
      preflightResults.push(await preflightBranch(branch, ctx, database));
    }

    const dispositions = preflightResults.map((r) => ({ ...r.disposition }));

    if (args.mode === "dry_run") {
      // Request binding mismatch is still reported as refusals in preview.
      if (requestIdMismatch) {
        return {
          ok: true,
          requestId,
          mode: "dry_run",
          dispositions: dispositions.map((d) => ({
            ...d,
            eligible: false,
            refusalReason: "request_binding_mismatch",
            outcome: undefined,
          })),
        };
      }
      return { ok: true, requestId, mode: "dry_run", dispositions };
    }

    // Apply path
    const approvalEvidence = args.approvalEvidence?.trim() ?? "";
    const approvalMissing = approvalEvidence.length === 0;

    const batchRefusalReason = approvalMissing
      ? "approval_required"
      : requestIdMismatch
        ? "request_binding_mismatch"
        : undefined;

    if (batchRefusalReason) {
      for (const result of preflightResults) {
        result.disposition.eligible = false;
        result.disposition.refusalReason = batchRefusalReason;
        result.disposition.outcome = undefined;
      }
    }

    const hardFailures: string[] = [];
    const now = new Date().toISOString();

    for (const result of preflightResults) {
      const branch = result.disposition.branch;
      const changeId = result.changeId;
      const preflightFacts = preflightResults.map((r) => ({
        branch: r.disposition.branch,
        path: r.disposition.path,
        eligible: r.disposition.eligible,
        refusalReason: r.disposition.refusalReason,
      }));

      if (
        result.disposition.outcome === "idempotent_already_detached" ||
        !result.disposition.eligible
      ) {
        const outcome: WorktreeDetachDisposition["outcome"] = result.disposition
          .eligible
          ? "idempotent_already_detached"
          : "refused";

        const payload: WorktreeDematerializedSignalPayload = {
          branch,
          requestId,
          branches: normalizedBranches,
          cutoffMs: args.cutoffMs,
          preflightFacts,
          outcome,
          ...(outcome === "refused"
            ? { reason: result.disposition.refusalReason }
            : {}),
          ...(approvalEvidence ? { approvalEvidence } : {}),
          dematerializedAt: now,
        };

        const signalResult = await fireDetachSignal(
          projectRoot,
          options.store,
          changeId,
          payload,
          options.signalTimeoutMs,
        );
        if (!signalResult.ok) {
          hardFailures.push(
            `${branch}: unable to record ${outcome} receipt: ${signalResult.warning}`,
          );
        }

        result.disposition.outcome = outcome;
        continue;
      }

      // Eligible materialized worktree: remove directory only.
      const worktreePath = result.recordPath;
      if (!worktreePath) {
        result.disposition.eligible = false;
        result.disposition.refusalReason = "missing_worktree_path";
        result.disposition.outcome = "refused";
        continue;
      }

      const removeResult = await gitWorktreeRemove(
        projectRoot,
        worktreePath,
        GIT_WORKTREE_REMOVE_TIMEOUT_MS,
      );
      if (!removeResult.ok) {
        result.disposition.eligible = false;
        result.disposition.refusalReason = `remove_failed: ${removeResult.reason}`;
        result.disposition.outcome = "refused";
        const payload: WorktreeDematerializedSignalPayload = {
          branch,
          requestId,
          branches: normalizedBranches,
          cutoffMs: args.cutoffMs,
          preflightFacts,
          outcome: "refused",
          reason: result.disposition.refusalReason,
          ...(approvalEvidence ? { approvalEvidence } : {}),
          dematerializedAt: now,
        };
        const signalResult = await fireDetachSignal(
          projectRoot,
          options.store,
          changeId,
          payload,
          options.signalTimeoutMs,
        );
        if (!signalResult.ok) {
          hardFailures.push(
            `${branch}: unable to record refused receipt: ${signalResult.warning}`,
          );
        }
        continue;
      }

      const detachedPayload: WorktreeDematerializedSignalPayload = {
        branch,
        requestId,
        branches: normalizedBranches,
        cutoffMs: args.cutoffMs,
        preflightFacts,
        outcome: "detached",
        ...(approvalEvidence ? { approvalEvidence } : {}),
        dematerializedAt: now,
      };
      const signalResult = await fireDetachSignal(
        projectRoot,
        options.store,
        changeId,
        detachedPayload,
        options.signalTimeoutMs,
      );
      if (signalResult.ok) {
        result.disposition.outcome = "detached";
        continue;
      }

      // Deterministic recovery: the directory is gone but the durable receipt
      // was not recorded. Roll back the Git removal so disk and registry stay
      // consistent, then record the refused outcome.
      const addResult = await gitWorktreeAdd(
        projectRoot,
        worktreePath,
        branch,
        GIT_WORKTREE_REMOVE_TIMEOUT_MS,
      );

      if (addResult.ok) {
        const refusedPayload: WorktreeDematerializedSignalPayload = {
          branch,
          requestId,
          branches: normalizedBranches,
          cutoffMs: args.cutoffMs,
          preflightFacts,
          outcome: "refused",
          reason: "detach_signal_failed_compensated",
          ...(approvalEvidence ? { approvalEvidence } : {}),
          dematerializedAt: now,
        };
        const refusedSignalResult = await fireDetachSignal(
          projectRoot,
          options.store,
          changeId,
          refusedPayload,
          options.signalTimeoutMs,
        );
        if (!refusedSignalResult.ok) {
          hardFailures.push(
            `${branch}: compensated rollback succeeded but refused receipt signal failed: ${refusedSignalResult.warning}`,
          );
        }
        result.disposition.eligible = false;
        result.disposition.refusalReason = "detach_signal_failed_compensated";
        result.disposition.outcome = "refused";
      } else {
        const refusedPayload: WorktreeDematerializedSignalPayload = {
          branch,
          requestId,
          branches: normalizedBranches,
          cutoffMs: args.cutoffMs,
          preflightFacts,
          outcome: "refused",
          reason: `detach_signal_compensation_failed: ${addResult.reason}`,
          ...(approvalEvidence ? { approvalEvidence } : {}),
          dematerializedAt: now,
        };
        const refusedSignalResult = await fireDetachSignal(
          projectRoot,
          options.store,
          changeId,
          refusedPayload,
          options.signalTimeoutMs,
        );
        if (!refusedSignalResult.ok) {
          hardFailures.push(
            `${branch}: detach signal failed and compensation also failed: ${signalResult.warning}; rollback: ${addResult.reason}; refused receipt signal: ${refusedSignalResult.warning}`,
          );
        } else {
          hardFailures.push(
            `${branch}: detach signal failed and compensation failed: ${signalResult.warning}; rollback: ${addResult.reason}`,
          );
        }
        result.disposition.eligible = false;
        result.disposition.refusalReason = `detach_signal_compensation_failed: ${addResult.reason}`;
        result.disposition.outcome = "refused";
      }
    }

    if (hardFailures.length > 0) {
      return {
        ok: false,
        reason: hardFailures.join("; "),
        requestId,
        dispositions: preflightResults.map((r) => r.disposition),
      };
    }

    return {
      ok: true,
      requestId,
      mode: "apply",
      dispositions: preflightResults.map((r) => r.disposition),
    };
  } finally {
    try {
      await releaseGitWorktreeFlock(projectStateDir);
    } catch (err) {
      log.warn(
        `Failed to release git-worktree flock: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
