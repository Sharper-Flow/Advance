/**
 * Exact-batch directory-only worktree detach (rq-migrateExistingAdvWorktrees).
 *
 * Distinct from terminal cleanup: removes only the worktree directory, preserves
 * the local branch and ADV change record, and writes a durable dematerialize
 * durable local worktree state. Never invoked by reapers, triage,
 * startup cleanup, or migration automation.
 */

import { createHash } from "node:crypto";
import * as path from "node:path";

import { execFileGitAsync, execFileGitCb } from "../../utils/git-binary";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
} from "../../utils/git-worktree-flock";
import { getWorktreeRecord, type WorktreeStateAccess } from "./state";
import { inferChangeIdFromBranch } from "./branch-parser";
import { isWorktreeInUse } from "./in-use";
import { getProjectId, getExternalRoot } from "../../utils/project-id";
import {
  parseWorktreeListPorcelain,
  type DiskWorktree,
} from "./porcelain-parser";

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

async function listGitWorktreeEntries(
  repoRoot: string,
): Promise<DiskWorktree[]> {
  const { stdout } = await execFileGitAsync(
    ["worktree", "list", "--porcelain", "-z"],
    { cwd: repoRoot, timeout: 10_000 },
  );
  return parseWorktreeListPorcelain(stdout);
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

// =============================================================================
// PREFLIGHT
// =============================================================================

interface PreflightContext {
  repoRoot: string;
  cutoffAt: number;
  requestId: string;
}

interface PreflightResult {
  disposition: WorktreeDetachDisposition;
  recordPath: string | undefined;
}

async function preflightBranch(
  branch: string,
  ctx: PreflightContext,
  access: WorktreeStateAccess,
): Promise<PreflightResult> {
  const failure = (reason: string, path?: string): PreflightResult => ({
    recordPath: path,
    disposition: {
      branch,
      path,
      eligible: false,
      refusalReason: reason,
    },
  });

  if (!inferChangeIdFromBranch(branch)) {
    return failure("not_a_change_branch");
  }

  const record = await getWorktreeRecord(access, branch);
  if (!record) {
    return failure("missing_worktree_record");
  }

  const recordPath = record.path;

  // If already dematerialized, this request is idempotent.
  if (
    record.status === "unmaterialized" ||
    record.materialized === false ||
    !recordPath
  ) {
    return {
      recordPath,
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
    (e) => e.branch === branch,
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

  const branchActivityAt = await getBranchActivityAt(ctx.repoRoot, branch);

  const branchTooRecent =
    !branchActivityAt || new Date(branchActivityAt).getTime() > ctx.cutoffAt;
  if (branchTooRecent) {
    return failure("branch_activity_too_recent", recordPath);
  }

  return {
    recordPath,
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
    log?: Logger;
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
  };

  let lock: Awaited<ReturnType<typeof acquireGitWorktreeFlock>>;
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
    const approvalMissing = (args.approvalEvidence?.trim() ?? "").length === 0;

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

    for (const result of preflightResults) {
      if (
        result.disposition.outcome === "idempotent_already_detached" ||
        !result.disposition.eligible
      ) {
        const outcome: WorktreeDetachDisposition["outcome"] = result.disposition
          .eligible
          ? "idempotent_already_detached"
          : "refused";

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
        continue;
      }

      result.disposition.outcome = "detached";
    }

    return {
      ok: true,
      requestId,
      mode: "apply",
      dispositions: preflightResults.map((r) => r.disposition),
    };
  } finally {
    try {
      await releaseGitWorktreeFlock(projectStateDir, lock.ownerToken);
    } catch (err) {
      log.warn(
        `Failed to release git-worktree flock: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
