/// <reference types="bun-types" />

/**
 * ADV Worktree Tools
 *
 * Creates isolated git worktrees for AI development sessions. Runtime support
 * is Linux-first for process-CWD safety checks, with platform-specific graceful
 * degradation documented in the focused helper modules.
 *
 * Inspired by opencode-worktree-session by Felix Anhalt
 * https://github.com/felixAnhalt/opencode-worktree-session
 * License: MIT
 *
 * Adapted for ADV with production-proven worktree patterns.
 */

// WorktreeStateAccess remains named Database for the existing tool contract.
import type { WorktreeStateAccess as Database } from "./state";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import * as path from "node:path";
import { execFileGitCb } from "../../utils/git-binary";
import { isValidGitBranchRef } from "../../utils/git-ref";
import { boundedRetry } from "../../utils/fs";

/** Logger interface for structured logging */
interface Logger {
  debug: (msg: string) => void;
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

import { parse as parseJsonc } from "jsonc-parser";
import { z } from "zod";

import { getProjectId as getProjectIdRaw } from "../../utils/project-id";
import { isWorktreeInUse } from "./in-use";
import {
  clearPendingDelete,
  getPendingDeletes,
  getWorktreeRecord,
  getWorktreePath,
  findBranchOwnersAcrossChanges,
  recordPendingDeleteFailure,
  setPendingDelete,
} from "./state";
import { inferChangeIdFromBranch } from "./branch-parser";
import { scanGitWorkspaceFacts } from "./census";
import {
  decodeWorktreeDeletionToken,
  WorktreeDeletionArchiveRecoverySchema,
  WorktreeDeletionPlanSchema,
  type WorktreeDeletionArchiveRecovery,
  type WorktreeDeletionPlan,
} from "./deletion-contracts";
import {
  createWorktreeDeletionPlanner,
  type WorktreeDeletionIntegrationFailure,
  type WorktreeDeletionPlanResult,
} from "./deletion-planner";
import {
  createWorktreeBeforeRemoveStage,
  createWorktreeReconciliationStage,
  executeWorktreeDeletion,
} from "./deletion-executor";
import { runHooksWithSafety } from "./hooks";
import { appendDebugLog } from "../../utils/debug-log";
import { execGit, getDefaultBranch } from "../../utils/git";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
} from "../../utils/git-worktree-flock";
import {
  assertPathInsideDirectory,
  getExternalRoot,
  getWorktreeBase,
} from "../../utils/project-id";
import {
  deleteAdvWorkspace,
  findWorkspaceByDirectoryChecked,
  type WarpDeps,
} from "../../utils/workspace-warp";
import type { Store } from "../../storage/store";
import { withTimeout, TimeoutError } from "../../utils/with-timeout";
import { execGh, type GhExecResult } from "../../integrations/gh-cli";
import { proveLocalBranchIntegration } from "../../utils/branch-integration";
import { parseGitRemoteUrl } from "../../utils/git-remote";
import type { WorktreeOperationContext } from "../../utils/worktree-operation";
import { createWorktreeOperationContext } from "../../utils/worktree-operation";

export { advWorktreeDetachBatch } from "./detach";
export {
  WorktreeDeletionPlanner,
  createWorktreeDeletionPlanner,
} from "./deletion-planner";
export {
  WorktreeDeletionExecutor,
  executeWorktreeDeletion,
} from "./deletion-executor";

const DEFAULT_CHANGE_STATUS_READ_TIMEOUT_MS = 1_500;
const PENDING_DELETE_RETURN_RESERVE_MS = 100;

async function readChangeStatusWithCleanupTimeout(
  store: Store,
  changeId: string,
  timeoutMs = DEFAULT_CHANGE_STATUS_READ_TIMEOUT_MS,
): Promise<
  | { ok: true; status: string | undefined }
  | {
      ok: false;
      reason: "store_read_timeout" | "store_read_failed";
      error: unknown;
    }
> {
  try {
    const loaded = await withTimeout(
      store.changes.get(changeId),
      timeoutMs,
      `Timed out reading change status for ${changeId}`,
    );
    return {
      ok: true,
      status: loaded.success && loaded.data ? loaded.data.status : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof TimeoutError
          ? "store_read_timeout"
          : "store_read_failed",
      error,
    };
  }
}

/** Automatic pending-delete retry cap; manual worktree_cleanup can retry after remediation. */
const MAX_PENDING_DELETE_ATTEMPTS = 5;

// =============================================================================
// TYPES & SCHEMAS
// =============================================================================

/** Result type for fallible operations */
interface OkResult<T> {
  readonly ok: true;
  readonly value: T;
}
interface ErrResult<E> {
  readonly ok: false;
  readonly error: E;
}
type Result<T, E> = OkResult<T> | ErrResult<E>;

const Result = {
  ok: <T>(value: T): OkResult<T> => ({ ok: true, value }),
  err: <E>(error: E): ErrResult<E> => ({ ok: false, error }),
};

/**
 * Git branch name validation - blocks invalid refs and shell metacharacters
 * Characters blocked: control chars (0x00-0x1f, 0x7f), ~^:?*[]\\, and shell metacharacters
 */
const branchNameSchema = z
  .string()
  .min(1, "Branch name cannot be empty")
  .refine((name) => !name.startsWith("-"), {
    message: "Branch name cannot start with '-' (prevents option injection)",
  })
  .refine((name) => !name.startsWith("/") && !name.endsWith("/"), {
    message: "Branch name cannot start or end with '/'",
  })
  .refine((name) => !name.includes("//"), {
    message: "Branch name cannot contain '//'",
  })
  .refine((name) => !name.includes("@{"), {
    message: "Branch name cannot contain '@{' (git reflog syntax)",
  })
  .refine((name) => !name.includes(".."), {
    message: "Branch name cannot contain '..'",
  })
  // eslint-disable-next-line no-control-regex -- control character detection is intentional for security
  .refine((name) => !/[\x00-\x1f\x7f ~^:?*[\]\\]/.test(name), {
    message: "Branch name contains invalid characters",
  })
  .max(255, "Branch name too long")
  .refine(
    (name) => isValidGitBranchRef(name),
    "Contains invalid git ref characters",
  )
  .refine(
    (name) => !name.startsWith(".") && !name.endsWith("."),
    "Cannot start or end with dot",
  )
  .refine((name) => !name.endsWith(".lock"), "Cannot end with .lock");

function validateBranchNameInput(
  value: string,
  label = "Branch name",
): { ok: true } | { ok: false; message: string } {
  const parsed = branchNameSchema.safeParse(value);
  if (parsed.success) return { ok: true };
  return {
    ok: false,
    message: `${label}: ${parsed.error.issues[0]?.message ?? "invalid branch name"}`,
  };
}

/**
 * Worktree plugin configuration schema.
 * Config file: .opencode/worktree.jsonc
 */
export const worktreeModes = ["warp", "spawn", "terminal"] as const;

export type WorktreeMode = (typeof worktreeModes)[number];

const rawWorktreeConfigSchema = z.object({
  mode: z
    .enum(worktreeModes)
    .optional()
    .describe(
      "warp: register worktree as OpenCode workspace and warp session into it (default, recommended). " +
        "spawn: open a new terminal with a forked session (legacy non-inline behavior). " +
        "terminal: stay in current session and use workdir= per tool (legacy inline behavior; auto-fallback when warp endpoints absent).",
    ),
  /** @deprecated use `mode` instead. true → "terminal", false → "spawn". */
  inline: z.boolean().optional(),
  sync: z
    .object({
      /** Files to copy from main worktree (relative paths only) */
      copyFiles: z.array(z.string()).default([]),
      /** Directories to symlink from main worktree (saves disk space) */
      symlinkDirs: z.array(z.string()).default([]),
      /** Patterns to exclude from copying (reserved for future use) */
      exclude: z.array(z.string()).default([]),
    })
    .default(() => ({ copyFiles: [], symlinkDirs: [], exclude: [] })),
  hooks: z
    .object({
      /** Commands to run after worktree creation */
      postCreate: z.array(z.string()).default([]),
      /** Commands to run before worktree deletion */
      preDelete: z.array(z.string()).default([]),
    })
    .default(() => ({ postCreate: [], preDelete: [] })),
});

type RawWorktreeConfig = z.infer<typeof rawWorktreeConfigSchema>;

interface WorktreeConfig extends Omit<RawWorktreeConfig, "mode" | "inline"> {
  mode: WorktreeMode;
  /** @deprecated Legacy bridge until create/delete flows are fully mode-based. */
  inline: boolean;
}

const hasOwn = (value: unknown, key: string): boolean =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key);

const inlineForMode = (mode: WorktreeMode): boolean => mode !== "spawn";

export function normalizeWorktreeConfig(
  input: unknown,
  log?: Pick<Logger, "warn">,
): WorktreeConfig {
  const parsed = rawWorktreeConfigSchema.parse(input);
  const modeWasProvided = hasOwn(input, "mode");
  const inlineWasProvided = hasOwn(input, "inline");

  let mode: WorktreeMode;
  if (parsed.mode) {
    mode = parsed.mode;
    if (inlineWasProvided) {
      log?.warn(
        '[worktree] Ignoring deprecated worktree config "inline" because "mode" is set.',
      );
    }
  } else if (inlineWasProvided) {
    mode = parsed.inline ? "terminal" : "spawn";
    log?.warn(
      '[worktree] Deprecated worktree config "inline" detected; use "mode": "terminal" for inline true or "mode": "spawn" for inline false.',
    );
  } else {
    mode = "warp";
  }

  return {
    ...parsed,
    mode,
    inline: modeWasProvided ? inlineForMode(mode) : (parsed.inline ?? true),
  };
}

// =============================================================================
// BRANCH INTEGRATION & UNCOMMITTED STATE HELPERS (T9)
// =============================================================================

import { verifyBranchIntegration } from "../../utils/branch-integration";

export async function detectUncommittedState(
  worktreePath: string,
): Promise<{ clean: boolean; files: string[] }> {
  return new Promise((resolve, reject) => {
    execFileGitCb(
      ["status", "--porcelain"],
      { cwd: worktreePath },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        const lines = stdout.trim().split("\n").filter(Boolean);
        resolve({ clean: lines.length === 0, files: lines });
      },
    );
  });
}

/**
 * Remove empty branch-prefix parents after a worktree directory is gone.
 *
 * Uses only `rmdir` against already-empty directories. Never recursively
 * deletes, never removes `worktreeBase`, and throws on namespace escape.
 */
export async function reapEmptyWorktreeParents(
  removedWorktreePath: string,
  worktreeBase: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const base = path.resolve(worktreeBase);
  let current = path.dirname(path.resolve(removedWorktreePath));
  const removed: string[] = [];

  assertPathInsideDirectory(current, base);

  while (current !== base) {
    if (signal?.aborted) break;
    assertPathInsideDirectory(current, base);
    try {
      await rmdir(current);
      removed.push(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }

  return removed;
}

/**
 * Check if a path exists, distinguishing ENOENT from other errors (Law 4)
 */
async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch (e: unknown) {
    if (e && typeof e === "object" && "code" in e && e.code === "ENOENT") {
      return false;
    }
    throw e; // Re-throw permission errors, etc.
  }
}

// =============================================================================
// GIT MODULE
// =============================================================================

/** Default git subprocess bound for non-cleanup callers of the local helper. */
const DEFAULT_WORKTREE_GIT_TIMEOUT_MS = 30000;

/**
 * Execute a git command safely using child_process.execFile.
 * Avoids shell interpolation entirely by passing args as array.
 * Node-compatible (used in tests); replaces legacy Bun.spawn.
 *
 * `timeoutMs` defaults to {@link DEFAULT_WORKTREE_GIT_TIMEOUT_MS}. Cleanup
 * discovery callers pass a value strictly below the worktree tool budget so a
 * single hung invocation cannot consume the whole budget
 * (rq-worktreeBoundedCleanup02). Non-cleanup callers keep the default.
 */
async function git(
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_WORKTREE_GIT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFileGitCb(
      args,
      {
        cwd,
        timeout: timeoutMs,
        signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve(
            Result.err(
              stderr.trim() || error.message || `git ${args[0]} failed`,
            ),
          );
        } else {
          resolve(Result.ok(stdout.trim()));
        }
      },
    );
  });
}

async function branchExists(cwd: string, branch: string): Promise<boolean> {
  const result = await git(["rev-parse", "--verify", branch], cwd);
  return result.ok;
}

interface GitWorktreeEntry {
  path: string;
  branch?: string;
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

    if (current && line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length);
    }
  }

  if (current) entries.push(current);
  return entries;
}

async function findGitWorktreeByBranch(
  cwd: string,
  branch: string,
): Promise<GitWorktreeEntry | null> {
  const result = await git(["worktree", "list", "--porcelain"], cwd);
  if (!result.ok) return null;

  const fullRef = `refs/heads/${branch}`;
  return (
    parseGitWorktreePorcelain(result.value).find(
      (entry) => entry.branch === fullRef || entry.branch === branch,
    ) ?? null
  );
}

// =============================================================================
// ADV-SAFE WORKTREE CREATE (T10 — KD-13, peer-review F3, R14)
// =============================================================================

export interface AdvWorktreeCreateDeps {
  projectRoot: string;
  database: Database;
  log: Logger;
  /**
   * Optional Store for durable change-status reads during cleanup.
   */
  store?: Store;
  resolveDefaultBranch?: (cwd: string) => Promise<string | null>;
  detectStaleBasis?: (
    base: string,
    cwd: string,
  ) => Promise<{ stale: boolean; reason?: string; suggestion?: string }>;
  hooks?: { postCreate?: string[] };
  flock?: {
    acquire: (
      dir: string,
    ) => Promise<{ owned: boolean; release: () => Promise<void> }>;
  };
  /**
   * Injectables for the bounded worktree-create contention retry loop.
   * In production these default to a 1,500 ms budget with 25 ms base and
   * 250 ms cap; tests supply deterministic clock/sleep/random.
   */
  contention?: {
    budgetMs?: number;
    baseMs?: number;
    capMs?: number;
    jitter?: number;
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  };
}

export type AdvWorktreeCreateResult =
  | {
      ok: true;
      branch: string;
      path: string;
      baseRef: string;
      headSha: string;
      reused: boolean;
    }
  | { ok: false; error: "DEFAULT_BRANCH_UNRESOLVABLE"; hint: string }
  | { ok: false; error: "STALE_BASE"; reason: string; suggestion: string }
  | {
      ok: false;
      error: "BRANCH_LOCKED";
      hint: string;
      attempts: number;
      elapsedMs: number;
    }
  | {
      ok: false;
      error: "BRANCH_IN_USE";
      branch: string;
      ownerChangeIds: string[];
      hint: string;
    }
  | { ok: false; error: "GIT_FAILED"; reason: string }
  | {
      ok: false;
      error: "SETUP_FAILED";
      branch: string;
      path: string;
      reason: string;
    }
  | { ok: false; error: "INVALID_BRANCH"; reason: string };

export async function advWorktreeCreate(
  branch: string,
  opts: { base?: string; force?: boolean } = {},
  deps: AdvWorktreeCreateDeps,
): Promise<AdvWorktreeCreateResult> {
  const repoRoot = deps.projectRoot;

  const branchValidation = validateBranchNameInput(branch);
  if (!branchValidation.ok) {
    return {
      ok: false,
      error: "INVALID_BRANCH",
      reason: "Invalid branch name",
    };
  }
  if (opts.base) {
    const baseValidation = validateBranchNameInput(opts.base, "Base branch");
    if (!baseValidation.ok) {
      return {
        ok: false,
        error: "INVALID_BRANCH",
        reason: baseValidation.message,
      };
    }
  }

  const inferredChangeId = inferChangeIdFromBranch(branch);
  const ownerChangeIds = await findBranchOwnersAcrossChanges(
    deps.database,
    branch,
    inferredChangeId!,
  );
  if (ownerChangeIds.length > 0) {
    return {
      ok: false,
      error: "BRANCH_IN_USE",
      branch,
      ownerChangeIds,
      hint: "Branch is already registered by an active ADV change workflow",
    };
  }

  // Step 0: reuse an already-registered git worktree before stale-basis checks,
  // flock, or git worktree add. Git is authoritative for this local fact.
  const existingWorktree = await findGitWorktreeByBranch(repoRoot, branch);
  if (existingWorktree) {
    if (await pathExists(existingWorktree.path)) {
      const headSha = (
        await execGit(["rev-parse", "HEAD"], existingWorktree.path)
      ).trim();
      const baseRef = opts.base ?? "existing";

      return {
        ok: true,
        branch,
        path: existingWorktree.path,
        baseRef,
        headSha,
        reused: true,
      };
    }

    const pruneResult = await git(["worktree", "prune"], repoRoot);
    if (!pruneResult.ok) {
      return { ok: false, error: "GIT_FAILED", reason: pruneResult.error };
    }
  }

  // Step 1: resolve base branch explicitly. NEVER fall through to HEAD.
  const resolveDefaultBranchFn = deps.resolveDefaultBranch ?? getDefaultBranch;
  const resolvedBase = opts.base ?? (await resolveDefaultBranchFn(repoRoot));
  if (!resolvedBase) {
    return {
      ok: false,
      error: "DEFAULT_BRANCH_UNRESOLVABLE",
      hint: "Specify opts.base explicitly or fix repo HEAD (no origin/HEAD, no init.defaultBranch, no main branch found)",
    };
  }

  // Step 2: stale-basis check — refuse to fork from a merged-and-deleted branch.
  async function defaultDetectStaleBasis(
    base: string,
    cwd: string,
  ): Promise<{ stale: boolean; reason?: string; suggestion?: string }> {
    // Adapt detectStaleBranchHead (which checks current HEAD) to check any base branch.
    // We do this by checking if the base branch is merged into default AND has no remote.
    try {
      const defaultBranch = await getDefaultBranch(cwd);
      if (base === defaultBranch) {
        return { stale: false };
      }
      const mergedList = await execGit(
        ["branch", "--merged", defaultBranch],
        cwd,
      );
      const mergedBranches = mergedList
        .split("\n")
        .map((line) => line.replace(/^\*?\s+/, "").trim())
        .filter((line) => line.length > 0);
      const isMerged = mergedBranches.includes(base);
      if (!isMerged) {
        return { stale: false };
      }
      const remoteOutput = await execGit(
        ["ls-remote", "--heads", "origin", base],
        cwd,
      );
      const remoteExists = remoteOutput.trim().length > 0;
      if (remoteExists) {
        return { stale: false };
      }
      return {
        stale: true,
        reason: `branch "${base}" is merged into ${defaultBranch} and remote branch is deleted`,
        suggestion: `git switch ${defaultBranch} && git branch -d ${base}`,
      };
    } catch {
      return { stale: false };
    }
  }
  const detectStaleBasisFn = deps.detectStaleBasis ?? defaultDetectStaleBasis;
  const staleCheck = await detectStaleBasisFn(resolvedBase, repoRoot);
  if (staleCheck.stale && !opts.force) {
    return {
      ok: false,
      error: "STALE_BASE",
      reason: staleCheck.reason ?? "",
      suggestion: staleCheck.suggestion ?? "",
    };
  }

  // Step 3: serialize concurrent create calls via the per-project flock (T15).
  const projectId = await getProjectIdRaw(repoRoot);
  const projectStateDir = projectId ? getExternalRoot(projectId) : repoRoot;
  // Ensure the state directory exists before attempting to acquire lock.
  await mkdir(projectStateDir, { recursive: true });
  const flockAcquireFn =
    deps.flock?.acquire ??
    (async (dir: string) => {
      const acquired = await acquireGitWorktreeFlock(dir);
      return {
        ...acquired,
        release: async () =>
          acquired.owned
            ? releaseGitWorktreeFlock(dir, acquired.ownerToken)
            : Promise.resolve(),
      };
    });
  const contention = deps.contention ?? {};
  const lockResult = await boundedRetry<{ release: () => Promise<void> }>({
    attempt: async () => {
      const acquired = await flockAcquireFn(projectStateDir);
      if (acquired.owned) {
        return { ok: true, value: { release: acquired.release } };
      }
      return { ok: false };
    },
    budgetMs: contention.budgetMs ?? 1500,
    baseMs: contention.baseMs ?? 25,
    capMs: contention.capMs ?? 250,
    jitter: contention.jitter,
    now: contention.now,
    sleep: contention.sleep,
    random: contention.random,
  });
  if (!lockResult.ok) {
    return {
      ok: false,
      error: "BRANCH_LOCKED",
      hint: "Another session is creating a worktree; retry in a moment",
      attempts: lockResult.attempts,
      elapsedMs: lockResult.elapsedMs,
    };
  }
  const lockRelease = lockResult.value.release;
  try {
    // A peer session may have created the worktree while we were waiting.
    // Re-check locally to avoid duplicate branch/path registration.
    const existingWorktreeAfterLock = await findGitWorktreeByBranch(
      repoRoot,
      branch,
    );
    if (
      existingWorktreeAfterLock &&
      (await pathExists(existingWorktreeAfterLock.path))
    ) {
      const headSha = (
        await execGit(["rev-parse", "HEAD"], existingWorktreeAfterLock.path)
      ).trim();
      const baseRef = opts.base ?? "existing";

      return {
        ok: true,
        branch,
        path: existingWorktreeAfterLock.path,
        baseRef,
        headSha,
        reused: true,
      };
    }

    // Step 4: execute git worktree add explicitly with the resolved base.
    const worktreePath = await getWorktreePath(repoRoot, branch);
    await mkdir(path.dirname(worktreePath), { recursive: true });

    const exists = await branchExists(repoRoot, branch);
    let gitResult: Result<string, string>;
    if (exists) {
      gitResult = await git(
        ["worktree", "add", worktreePath, branch],
        repoRoot,
      );
    } else {
      gitResult = await git(
        ["worktree", "add", "-b", branch, worktreePath, resolvedBase],
        repoRoot,
      );
    }
    if (!gitResult.ok) {
      return { ok: false, error: "GIT_FAILED", reason: gitResult.error };
    }

    const headSha = (await execGit(["rev-parse", "HEAD"], worktreePath)).trim();

    const worktreeConfig = await loadWorktreeConfig(repoRoot, deps.log);
    if (worktreeConfig.sync.copyFiles.length > 0) {
      await copyFiles(
        repoRoot,
        worktreePath,
        worktreeConfig.sync.copyFiles,
        deps.log,
      );
    }
    if (worktreeConfig.sync.symlinkDirs.length > 0) {
      await symlinkDirs(
        repoRoot,
        worktreePath,
        worktreeConfig.sync.symlinkDirs,
        deps.log,
      );
    }

    // Step 6: postCreate hooks (T12 — setup failure blocks ADV routing).
    const postCreateHooks = [
      ...worktreeConfig.hooks.postCreate,
      ...(deps.hooks?.postCreate ?? []),
    ];
    if (postCreateHooks.length) {
      try {
        await runHooksWithSafety("postCreate", worktreePath, postCreateHooks);
      } catch (err) {
        const reason = String(err instanceof Error ? err.message : err);
        deps.log.warn(
          `[worktree] postCreate hook failed for ${branch}: ${err}`,
        );
        return {
          ok: false,
          error: "SETUP_FAILED",
          branch,
          path: worktreePath,
          reason,
        };
      }
    }

    return {
      ok: true,
      branch,
      path: worktreePath,
      baseRef: resolvedBase,
      headSha,
      reused: false,
    };
  } finally {
    await lockRelease();
  }
}

export type AdvWorktreeResumeTarget =
  | { branch: string; changeId?: string }
  | { changeId: string; branch?: string };

export type AdvWorktreeResumeResult =
  | {
      ok: true;
      branch: string;
      path: string;
      baseRef: string;
      headSha: string;
      reused: boolean;
      materialized: true;
      /** Pre-execution rebase result (best-effort, only for reused worktrees). */
      rebase?: {
        status: "up_to_date" | "rebased" | "conflict" | "failed";
        detail?: string;
        conflictFiles?: string[];
      };
    }
  | {
      ok: false;
      error: "SETUP_FAILED";
      branch: string;
      path?: string;
      reason: string;
    }
  | { ok: false; error: "TARGET_REQUIRED"; hint: string }
  | Exclude<AdvWorktreeCreateResult, { ok: true }>;

function branchFromResumeTarget(
  target: AdvWorktreeResumeTarget,
): string | null {
  const branch = target.branch?.trim();
  if (branch) return branch;
  const changeId = target.changeId?.trim();
  if (!changeId) return null;
  return changeId.startsWith("change/") ? changeId : `change/${changeId}`;
}

export async function advWorktreeResume(
  target: AdvWorktreeResumeTarget,
  opts: { base?: string; force?: boolean } = {},
  deps: AdvWorktreeCreateDeps,
): Promise<AdvWorktreeResumeResult> {
  // Resume/materialization tool contract: rq-wl-resumeTool01.
  const branch = branchFromResumeTarget(target);
  if (!branch) {
    return {
      ok: false,
      error: "TARGET_REQUIRED",
      hint: "Pass either branch or changeId",
    };
  }

  const record = await getWorktreeRecord(deps.database, branch);
  if (
    record?.status === "setup_failed" ||
    (record?.materialized !== false && record?.setupReady === false)
  ) {
    return {
      ok: false,
      error: "SETUP_FAILED",
      branch,
      path: record.path,
      reason: record.setupFailureReason ?? "worktree setup did not complete",
    };
  }

  if (record?.materialized !== false && record?.path) {
    if (await pathExists(record.path)) {
      const headSha = (
        await execGit(["rev-parse", "HEAD"], record.path)
      ).trim();

      // Best-effort pre-execution rebase for reused worktrees.
      // Fresh materializations skip this (created from trunk HEAD).
      let rebaseInfo:
        | {
            status: "up_to_date" | "rebased" | "conflict" | "failed";
            detail?: string;
            conflictFiles?: string[];
          }
        | undefined;
      try {
        const { preExecutionRebase } =
          await import("../apply-helpers/pre-rebase");
        const rebaseResult = await preExecutionRebase(record.path);
        if (rebaseResult.ok) {
          // Refresh headSha after successful rebase
          const newHeadSha = (
            await execGit(["rev-parse", "HEAD"], record.path)
          ).trim();
          return {
            ok: true,
            branch,
            path: record.path,
            baseRef: record.baseRef,
            headSha: newHeadSha,
            reused: true,
            materialized: true,
            rebase: {
              status: rebaseResult.status,
              ...(rebaseResult.commits
                ? { detail: `${rebaseResult.commits} commits applied` }
                : {}),
            },
          };
        }
        rebaseInfo = {
          status: rebaseResult.reason === "conflict" ? "conflict" : "failed",
          detail: rebaseResult.detail,
          ...(rebaseResult.conflictFiles
            ? { conflictFiles: rebaseResult.conflictFiles }
            : {}),
        };
      } catch {
        // Best-effort: if import or rebase throws, skip silently
      }

      return {
        ok: true,
        branch,
        path: record.path,
        baseRef: record.baseRef,
        headSha,
        reused: true,
        materialized: true,
        ...(rebaseInfo ? { rebase: rebaseInfo } : {}),
      };
    }
  }

  const result = await advWorktreeCreate(branch, opts, deps);
  if (!result.ok) return result;
  return {
    ...result,
    materialized: true,
  };
}

// Legacy createWorktree — kept for backward compatibility during T10 transition.
// Will be removed once all callers migrate to advWorktreeCreate.
async function _createWorktree(
  repoRoot: string,
  branch: string,
  baseBranch?: string,
): Promise<Result<string, string>> {
  const worktreePath = await getWorktreePath(repoRoot, branch);

  // Ensure parent directory exists
  await mkdir(path.dirname(worktreePath), { recursive: true });

  const exists = await branchExists(repoRoot, branch);

  if (exists) {
    // Checkout existing branch into worktree
    const result = await git(
      ["worktree", "add", worktreePath, branch],
      repoRoot,
    );
    return result.ok ? Result.ok(worktreePath) : result;
  } else {
    // Create new branch from base
    const base = baseBranch ?? "HEAD";
    const result = await git(
      ["worktree", "add", "-b", branch, worktreePath, base],
      repoRoot,
    );
    return result.ok ? Result.ok(worktreePath) : result;
  }
}

// =============================================================================
// ADV-SAFE WORKTREE DELETE (T9 — KD-6b, F2, R13)
// =============================================================================

export interface AdvWorktreeDeleteDeps {
  projectRoot: string;
  database: Database;
  log: Logger;
  approvalEvidence?: string;
  /**
   * Optional Store for durable change-status reads during cleanup.
   */
  store?: Store;
  /**
   * Optional timeout in milliseconds for durable change-status reads.
   */
  signalTimeoutMs?: number;
  /**
   * Cleanup-local budget for the whole delete path. Production callers set
   * this below the tool wrapper budget so delete returns typed retained state
   * before the SDK timeout instead of continuing destructive work silently.
   */
  operationTimeoutMs?: number;
  /** End-to-end cancellation context owned by the public delete handler. */
  operation?: WorktreeOperationContext;
  /** Optional timeout for live GitHub PR evidence lookup. */
  prEvidenceTimeoutMs?: number;
  /** Test seam for the bounded GitHub PR evidence command. */
  ghExec?: (
    args: string[],
    cwd: string,
    timeout: number,
    signal?: AbortSignal,
  ) => Promise<GhExecResult>;
  /**
   * Optional per-subprocess git bound for the cleanup discovery path. Cleanup
   * callers set this strictly below the worktree tool budget so no single hung
   * git invocation can exhaust it (rq-worktreeBoundedCleanup02). Omitted by
   * standalone delete callers, which keep the 30000ms helper default.
   */
  gitTimeoutMs?: number;
  worktreePath?: string;
  hooks?: { preDelete: string[] };
  integrationCheck?: typeof verifyBranchIntegration;
  registry?: { branch: string; changeId?: string; path: string }[];
  warpDeps?: WarpDeps;
  isWorktreeInUse?: (worktreePath: string) => boolean;
  census?: (
    repository: string,
    defaultBranch: string,
    timeoutMs: number,
  ) => Promise<import("./census").GitWorkspaceFacts>;
  mergedBranches?: (
    defaultBranch: string,
    repoRoot: string,
  ) => Promise<string[]>;
  prMergeEvidence?: (
    branch: string,
    repoRoot: string,
    operation?: WorktreeOperationContext,
  ) => Promise<PrMergedBranchIntegrationResult>;
  /** Lightweight path resolver used by the shared planner's terminal proof. */
  statePathResolver?: (changeId: string) => Promise<string | undefined>;
  /** Archive completion may inject the sole archive-owned recovery authority. */
  archiveRecovery?: WorktreeDeletionArchiveRecovery;
  /** Test seam for the shared planner/executor adapters. */
  deletionPlanner?: ReturnType<typeof createWorktreeDeletionPlanner>;
  deletionExecutor?: typeof executeWorktreeDeletion;
}

export type AdvWorktreeDeleteResult =
  | {
      ok: true;
      branch: string;
      path: string;
      dryRun?: boolean;
      status?: "planned" | "deleted";
      plan?: WorktreeDeletionPlan;
      planToken?: string;
      warnings?: string[];
      warning?: string;
    }
  | { ok: false; error: "INVALID_BRANCH"; reason: string }
  | {
      ok: false;
      error: "PLAN_REQUIRED" | "APPROVAL_REQUIRED";
      reason: string;
      hint: string;
    }
  | { ok: false; error: "WORKTREE_NOT_FOUND"; branch: string }
  | {
      ok: false;
      error: "TIME_BUDGET_EXHAUSTED";
      branch: string;
      path: string;
      reason: "time_budget_exhausted";
      hint: string;
    }
  | {
      ok: false;
      error: "WORKTREE_IN_USE";
      branch: string;
      path: string;
      hint: string;
    }
  | { ok: false; error: "INTEGRATION_REQUIRED"; reason: string; hint: string }
  | { ok: false; error: "UNCOMMITTED_WORK"; files: string[]; hint: string }
  | { ok: false; error: "HOOK_FAILED"; details: unknown }
  | {
      ok: false;
      error: "HOOK_INTRODUCED_CHANGES";
      files: string[];
      hint: string;
    }
  | {
      ok: false;
      error: "WORKSPACE_OWNERSHIP_UNCERTAIN";
      branch: string;
      path: string;
      reason: string;
      hint: string;
    }
  | {
      ok: false;
      error: "WORKSPACE_CLEANUP_FAILED";
      branch: string;
      path: string;
      reason: string;
      hint: string;
    }
  | { ok: false; error: "REMOVE_FAILED"; reason: string }
  | {
      ok: false;
      error: "DELETION_BLOCKED" | "DEADLINE_EXCEEDED" | "ALREADY_ABSENT";
      status: string;
      reason: string;
      stage?: string;
      hint?: string;
      branch?: string;
      path?: string;
    };

/**
 * Result of the OpenCode workspace preflight that runs before git worktree
 * removal.
 *
 * rq-terminalCleanupSafety01 / rq-terminalCleanupLifecycle01: ownership
 * preflight precedes workspace/git removal. Remote lookup failures are
 * advisory after the upstream local CWD safety check; a failed deletion of a
 * found workspace remains a typed retained blocker.
 */
type OpenCodeWorkspaceCleanupResult =
  | { ok: true; warning: string | null }
  | {
      ok: false;
      error: "WORKSPACE_OWNERSHIP_UNCERTAIN" | "WORKSPACE_CLEANUP_FAILED";
      reason: string;
      hint: string;
    };

async function cleanupOpenCodeWorkspaceForWorktree(
  worktreePath: string,
  branch: string,
  deps: AdvWorktreeDeleteDeps,
  operation: WorktreeOperationContext,
): Promise<OpenCodeWorkspaceCleanupResult> {
  if (!deps.warpDeps) return { ok: true, warning: null };
  if (operation.signal.aborted) {
    return {
      ok: false,
      error: "WORKSPACE_CLEANUP_FAILED",
      reason: "operation cancelled before workspace lookup",
      hint: "Retry with a fresh deletion plan.",
    };
  }

  const lookup = await findWorkspaceByDirectoryChecked(
    deps.warpDeps,
    worktreePath,
    branch,
    operation.signal,
  );
  if (!lookup.ok) {
    // Advisory only: the local isWorktreeInUse check upstream already proved
    // no live process holds this worktree as CWD (rq-terminalCleanupSafety01).
    // The remote workspace-list API is a stale-entry cleanup concern, not a
    // safety authority — when unreachable, proceed and surface the reason.
    deps.log.warn(
      `[worktree] OpenCode workspace registry unreachable for ${branch}: ${lookup.reason}; proceeding (local CWD safety check already cleared)`,
    );
    return {
      ok: true,
      warning: `workspace registry unreachable: ${lookup.reason}`,
    };
  }
  if (!lookup.workspace) return { ok: true, warning: null };

  try {
    if (operation.signal.aborted) {
      return {
        ok: false,
        error: "WORKSPACE_CLEANUP_FAILED",
        reason: "operation cancelled before workspace deletion",
        hint: "Retry with a fresh deletion plan.",
      };
    }
    await deleteAdvWorkspace(
      deps.warpDeps,
      lookup.workspace.workspaceID,
      operation.signal,
    );
    deps.log.debug(
      `[worktree] Cleaned up OpenCode workspace ${lookup.workspace.workspaceID}`,
    );
  } catch (error) {
    // Fail closed: the workspace still exists, so git removal would strand
    // an owned workspace. Retain with a typed blocker for retry (AC3/AC4).
    deps.log.warn(
      `[worktree] Failed to delete OpenCode workspace ${lookup.workspace.workspaceID} (retaining worktree): ${error}`,
    );
    return {
      ok: false,
      error: "WORKSPACE_CLEANUP_FAILED",
      reason: `workspace cleanup failed: could not delete OpenCode workspace ${lookup.workspace.workspaceID}: ${error}`,
      hint: "OpenCode workspace deletion failed; retained the worktree without removal. Retry with adv_worktree_cleanup after the OpenCode server responds.",
    };
  }
  return { ok: true, warning: null };
}

type PrMergedBranchIntegrationResult =
  | {
      ok: true;
      proof: "pr-head-exact" | "local-ancestor-of-pr-head";
      prNumber: number;
      prUrl?: string;
      headRefOid: string;
      baseRefName?: string;
      headRepository?: string;
      baseRepository?: string;
      mergeCommitOid?: string;
    }
  | {
      ok: false;
      classification?: "refusal" | "repair";
      reason: string;
      hint: string;
      details?: string[];
    };

interface GhPullRequestSummary {
  number?: number;
  state?: string;
  mergedAt?: string | null;
  headRefName?: string | null;
  headRefOid?: string | null;
  baseRefName?: string | null;
  headRepository?: { nameWithOwner?: string | null } | null;
  headRepositoryOwner?: { login?: string | null } | null;
  isCrossRepository?: boolean | null;
  mergeCommit?: { oid?: string | null } | null;
  url?: string;
}

export const GH_PR_LIST_JSON_FIELDS = [
  "number",
  "state",
  "mergedAt",
  "headRefName",
  "headRefOid",
  "baseRefName",
  "headRepository",
  "headRepositoryOwner",
  "isCrossRepository",
  "mergeCommit",
  "url",
] as const;

async function getPrMergedBranchIntegration(
  branch: string,
  defaultBranch: string,
  deps: AdvWorktreeDeleteDeps,
  operation: WorktreeOperationContext,
): Promise<PrMergedBranchIntegrationResult> {
  if (!isValidGitBranchRef(branch) || !isValidGitBranchRef(defaultBranch)) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_evidence_invalid",
      hint: "PR-aware cleanup requires valid local branch and default refs.",
    };
  }

  if (deps.prMergeEvidence) {
    return deps.prMergeEvidence(branch, deps.projectRoot, operation);
  }

  const remaining = (): number =>
    Math.max(1, operation.remainingMs() - operation.responseReserveMs);
  const checkBudget = (): void => operation.throwIfAborted("pr_proof_aborted");
  const repairForGitFailure = (
    error: string,
  ): PrMergedBranchIntegrationResult => ({
    ok: false,
    classification: "repair",
    reason: "git_failed",
    hint: "Git PR integration evidence could not be completed within the operation budget; retaining worktree.",
    details: [error],
  });

  checkBudget();
  const localHead = await git(
    ["rev-parse", "--verify", `${branch}^{commit}`],
    deps.projectRoot,
    Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
    operation.signal,
  );
  if (!localHead.ok) {
    return {
      ok: false,
      classification: "repair",
      reason: "local_branch_missing",
      hint: `Local branch ${branch} does not exist or cannot be resolved.`,
      details: [localHead.error],
    };
  }

  checkBudget();
  const remote = await git(
    ["config", "--get", "remote.origin.url"],
    deps.projectRoot,
    Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
    operation.signal,
  );
  if (!remote.ok) {
    return {
      ok: false,
      classification: "repair",
      reason: "git_remote_unavailable",
      hint: `The GitHub repository for ${branch} could not be resolved; retaining worktree.`,
      details: [remote.error],
    };
  }
  const parsedRemote = parseGitRemoteUrl(remote.value);
  if (!parsedRemote) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_evidence_invalid",
      hint: "The origin remote is not an unambiguous GitHub repository; retaining worktree.",
    };
  }
  checkBudget();
  const repoView = await (deps.ghExec ?? execGh)(
    ["repo", "view", "--json", "nameWithOwner"],
    deps.projectRoot,
    Math.min(deps.prEvidenceTimeoutMs ?? remaining(), remaining()),
    operation.signal,
  );
  if (repoView.exitCode !== 0) {
    return {
      ok: false,
      classification: "repair",
      reason: "gh_failed",
      hint: `Current GitHub repository identity unavailable for ${branch}; retaining worktree.`,
      details: [repoView.stderr || repoView.stdout || "gh repo view failed"],
    };
  }

  let currentRepository: string;
  try {
    const parsed = JSON.parse(repoView.stdout || "null") as unknown;
    const nameWithOwner =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as { nameWithOwner?: unknown }).nameWithOwner
        : undefined;
    if (
      typeof nameWithOwner !== "string" ||
      !/^[^/\s]+\/[^/\s]+$/.test(nameWithOwner)
    )
      throw new Error("gh repo view returned malformed nameWithOwner");
    currentRepository = nameWithOwner;
  } catch (error) {
    return {
      ok: false,
      classification: "refusal",
      reason: "gh_json_invalid",
      hint: `Current GitHub repository identity for ${branch} was not valid JSON; retaining worktree.`,
      details: [error instanceof Error ? error.message : String(error)],
    };
  }
  const currentRepositoryOwner = currentRepository.split("/")[0];

  checkBudget();
  const remoteHead = await git(
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    deps.projectRoot,
    Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
    operation.signal,
  );
  const detectedDefault = remoteHead.ok
    ? remoteHead.value.trim().replace(/^origin\//, "")
    : undefined;
  if (detectedDefault && detectedDefault !== defaultBranch) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_evidence_invalid",
      hint: `PR base ${defaultBranch} does not match detected default ${detectedDefault}; retaining worktree.`,
    };
  }

  checkBudget();
  const prList = await (deps.ghExec ?? execGh)(
    [
      "pr",
      "list",
      "--state",
      "all",
      "--head",
      branch,
      "--repo",
      currentRepository,
      "--base",
      defaultBranch,
      "--limit",
      "20",
      "--json",
      GH_PR_LIST_JSON_FIELDS.join(","),
    ],
    deps.projectRoot,
    Math.min(deps.prEvidenceTimeoutMs ?? remaining(), remaining()),
    operation.signal,
  );
  if (prList.exitCode !== 0) {
    return {
      ok: false,
      classification: "repair",
      reason: "gh_failed",
      hint: `GitHub PR evidence unavailable for ${branch}; retaining worktree.`,
      details: [prList.stderr || prList.stdout || "gh pr list failed"],
    };
  }

  let prs: GhPullRequestSummary[];
  try {
    const parsed = JSON.parse(prList.stdout || "[]") as unknown;
    prs = Array.isArray(parsed) ? (parsed as GhPullRequestSummary[]) : [];
  } catch (error) {
    return {
      ok: false,
      classification: "refusal",
      reason: "gh_json_invalid",
      hint: `GitHub PR evidence for ${branch} was not valid JSON; retaining worktree.`,
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (prs.length === 0) {
    return {
      ok: false,
      classification: "refusal",
      reason: "no_pr_evidence",
      hint: `No GitHub PR found for ${branch}; retaining worktree.`,
    };
  }

  const mergedPrs = prs.filter(
    (pr) =>
      pr.state === "MERGED" &&
      typeof pr.number === "number" &&
      Number.isInteger(pr.number) &&
      pr.number > 0 &&
      typeof pr.mergedAt === "string" &&
      pr.mergedAt.trim().length > 0 &&
      typeof pr.headRefOid === "string" &&
      pr.headRefOid.trim().length > 0,
  );
  if (mergedPrs.length === 0) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_not_merged",
      hint: `GitHub PR for ${branch} is not merged; retaining worktree.`,
      details: prs.map(
        (pr) => `PR #${pr.number ?? "?"}: ${pr.state ?? "unknown"}`,
      ),
    };
  }

  const localHeadSha = localHead.value.trim();
  const structuralCandidates = mergedPrs.filter(
    (pr) =>
      pr.number &&
      pr.headRefName === branch &&
      pr.baseRefName === defaultBranch &&
      pr.isCrossRepository === false &&
      typeof pr.headRepository?.nameWithOwner === "string" &&
      pr.headRepository.nameWithOwner.length > 0 &&
      pr.headRepository.nameWithOwner === currentRepository &&
      typeof pr.headRepositoryOwner?.login === "string" &&
      pr.headRepositoryOwner.login === currentRepositoryOwner &&
      typeof pr.mergeCommit?.oid === "string" &&
      pr.mergeCommit.oid.trim().length > 0,
  );
  if (structuralCandidates.length === 0) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_evidence_invalid",
      hint: `Merged PR evidence for ${branch} did not match the exact repository/head/base proof; retaining worktree.`,
    };
  }
  if (structuralCandidates.length > 1) {
    return {
      ok: false,
      classification: "refusal",
      reason: "pr_evidence_invalid",
      hint: `Multiple merged PRs matched ${branch}; retaining worktree.`,
      details: structuralCandidates.map((pr) => `PR #${pr.number}`),
    };
  }

  for (const pr of structuralCandidates) {
    if (!pr.number || !pr.headRefOid) continue;
    if (
      pr.headRefName !== branch ||
      pr.baseRefName !== defaultBranch ||
      pr.isCrossRepository !== false ||
      typeof pr.headRepository?.nameWithOwner !== "string" ||
      pr.headRepository.nameWithOwner !== currentRepository ||
      typeof pr.headRepositoryOwner?.login !== "string" ||
      pr.headRepositoryOwner.login !== currentRepositoryOwner
    )
      continue;

    checkBudget();
    const fetch = await git(
      ["fetch", "origin", `refs/pull/${pr.number}/head`],
      deps.projectRoot,
      Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
      operation.signal,
    );
    if (!fetch.ok) {
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs ||
        /timeout|timed out|deadline|abort/i.test(fetch.error)
      )
        return repairForGitFailure(fetch.error);
      continue;
    }
    const fetchedHead = await git(
      ["rev-parse", "--verify", "FETCH_HEAD^{commit}"],
      deps.projectRoot,
      Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
      operation.signal,
    );
    if (!fetchedHead.ok) {
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs ||
        /timeout|timed out|deadline|abort/i.test(fetchedHead.error)
      )
        return repairForGitFailure(fetchedHead.error);
      continue;
    }
    if (fetchedHead.value.trim() !== pr.headRefOid.trim()) continue;
    const ancestor = await git(
      ["merge-base", "--is-ancestor", branch, "FETCH_HEAD"],
      deps.projectRoot,
      Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
      operation.signal,
    );
    if (!ancestor.ok) {
      if (
        operation.signal.aborted ||
        operation.remainingMs() <= operation.responseReserveMs ||
        /timeout|timed out|deadline|abort/i.test(ancestor.error)
      )
        return repairForGitFailure(ancestor.error);
      continue;
    }

    const mergeCommitOid = pr.mergeCommit?.oid?.trim();
    if (mergeCommitOid) {
      checkBudget();
      const defaultFetch = await git(
        [
          "fetch",
          "--no-tags",
          "origin",
          `refs/heads/${defaultBranch}:refs/remotes/origin/${defaultBranch}`,
        ],
        deps.projectRoot,
        Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
        operation.signal,
      );
      if (!defaultFetch.ok) return repairForGitFailure(defaultFetch.error);
      const fetchedDefault = await git(
        [
          "rev-parse",
          "--verify",
          `refs/remotes/origin/${defaultBranch}^{commit}`,
        ],
        deps.projectRoot,
        Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
        operation.signal,
      );
      if (!fetchedDefault.ok) return repairForGitFailure(fetchedDefault.error);
      const remoteDefault = await git(
        [
          "merge-base",
          "--is-ancestor",
          mergeCommitOid,
          `refs/remotes/origin/${defaultBranch}`,
        ],
        deps.projectRoot,
        Math.min(deps.gitTimeoutMs ?? remaining(), remaining()),
        operation.signal,
      );
      if (!remoteDefault.ok) {
        const detail = remoteDefault.error;
        if (
          operation.signal.aborted ||
          operation.remainingMs() <= operation.responseReserveMs ||
          /timeout|timed out|deadline|abort/i.test(detail)
        )
          return repairForGitFailure(detail);
        return {
          ok: false,
          classification: "refusal",
          reason: "pr_merge_commit_unreachable",
          hint: `Merged PR #${pr.number} is not reachable from ${defaultBranch}; retaining worktree.`,
          details: [detail],
        };
      }
    }

    const headRepository = pr.headRepository.nameWithOwner;
    return {
      ok: true,
      proof:
        pr.headRefOid.trim() === localHeadSha
          ? "pr-head-exact"
          : "local-ancestor-of-pr-head",
      prNumber: pr.number,
      prUrl: pr.url,
      headRefOid: pr.headRefOid.trim(),
      baseRefName: defaultBranch,
      headRepository,
      baseRepository: currentRepository,
      ...(mergeCommitOid ? { mergeCommitOid } : {}),
    };
  }

  return {
    ok: false,
    classification: "refusal",
    reason: "local_has_commits_after_pr_head",
    hint: `Merged PR exists for ${branch}, but local branch has commits not proven merged by the PR head; retaining worktree.`,
    details: mergedPrs.map(
      (pr) => `PR #${pr.number ?? "?"}: ${pr.headRefOid ?? "unknown-head"}`,
    ),
  };
}

async function verifyPrMergedChangeBranchIntegration(
  branch: string,
  deps: AdvWorktreeDeleteDeps,
): Promise<{ ok: true } | { ok: false; reason: string; hint: string }> {
  const ownsOperation = deps.operation === undefined;
  const operation =
    deps.operation ??
    createWorktreeOperationContext({ budgetMs: deps.operationTimeoutMs });
  try {
    const defaultBranch = await getDefaultBranch(deps.projectRoot);
    const pr = await getPrMergedBranchIntegration(
      branch,
      defaultBranch,
      deps,
      operation,
    );
    if (pr.ok) {
      appendDebugLog(
        "worktree-delete",
        `verified squash PR merge for ${branch} via PR #${pr.prNumber} (${pr.proof})`,
      );
      return { ok: true };
    }
    return { ok: false, reason: pr.reason, hint: pr.hint };
  } finally {
    if (ownsOperation) {
      await operation.abort("operation_complete");
      operation.dispose();
    }
  }
}

function plannerResultToDeleteResult(
  branch: string,
  result: WorktreeDeletionPlanResult,
): AdvWorktreeDeleteResult {
  if (result.kind === "planned") {
    return {
      ok: true,
      status: "planned",
      dryRun: true,
      branch,
      path: result.plan.facts.worktree,
      plan: result.plan,
      planToken: result.plan.token,
      warnings: [...result.warnings],
    };
  }
  if (result.kind === "deadline") {
    return {
      ok: false,
      error: "DEADLINE_EXCEEDED",
      status: "deadline_exceeded",
      reason: result.message,
      stage: result.stage,
      branch,
      ...(result.target ? { path: result.target.cwd } : {}),
      hint: "Retry with a fresh deletion plan after the target repository responds.",
    };
  }
  if (result.kind === "unsupported" || result.kind === "repair") {
    return {
      ok: false,
      error: "DELETION_BLOCKED",
      status: result.kind === "unsupported" ? "unsupported" : "repair_required",
      reason: result.message,
      branch,
      hint: "Resolve the reported repository blocker, then request a new plan.",
    };
  }
  if (result.reason === "worktree_not_found")
    return { ok: false, error: "WORKTREE_NOT_FOUND", branch };
  if (result.reason === "worktree_in_use")
    return {
      ok: false,
      error: "WORKTREE_IN_USE",
      branch,
      path: result.facts?.worktree ?? "",
      hint: result.message,
    };
  if (result.reason === "dirty_worktree")
    return {
      ok: false,
      error: "UNCOMMITTED_WORK",
      files: [],
      hint: result.message,
    };
  return {
    ok: false,
    error: "INTEGRATION_REQUIRED",
    reason: result.reason,
    hint: result.message,
  };
}

async function advWorktreeDeleteShared(
  branch: string,
  opts: {
    force?: boolean;
    dryRun?: boolean;
    planToken?: string;
    approvalEvidence?: string;
  },
  deps: AdvWorktreeDeleteDeps,
): Promise<AdvWorktreeDeleteResult> {
  const branchValidation = validateBranchNameInput(branch);
  if (!branchValidation.ok)
    return {
      ok: false,
      error: "INVALID_BRANCH",
      reason: "Invalid branch name",
    };

  const changeId = inferChangeIdFromBranch(branch);
  const operation = deps.operation;
  if (!operation) {
    return {
      ok: false,
      error: "DELETION_BLOCKED",
      status: "missing_operation_context",
      reason: "destructive deletion requires an operation context",
      branch,
      hint: "Call the public worktree delete handler or provide an operation context.",
    };
  }
  const terminalProof = async (
    id: string,
  ): Promise<
    import("./deletion-contracts").WorktreeDeletionTerminalProof | undefined
  > => {
    if (!deps.store) return undefined;
    const loaded = await readChangeStatusWithCleanupTimeout(
      deps.store,
      id,
      deps.signalTimeoutMs ?? DEFAULT_CHANGE_STATUS_READ_TIMEOUT_MS,
    );
    if (
      !loaded.ok ||
      (loaded.status !== "archived" && loaded.status !== "closed")
    )
      return undefined;
    return {
      changeId: id,
      status: loaded.status,
      evidence: `durable terminal status: ${loaded.status}`,
    };
  };
  const integrationProof = async (
    branchName: string,
    head: string,
    defaultBranch: string,
    repository: string,
    operation: WorktreeOperationContext,
  ) => {
    const parsedRecovery = WorktreeDeletionArchiveRecoverySchema.safeParse(
      deps.archiveRecovery,
    );
    if (parsedRecovery.success) {
      const recovery = parsedRecovery.data;
      return {
        kind: "pr_merged" as const,
        branch: branchName,
        defaultBranch,
        head,
        evidence: `archive-owned merged PR #${recovery.prNumber}`,
        prNumber: recovery.prNumber,
        prHeadOid: recovery.prHeadOid,
        mergeCommitOid: recovery.mergeCommitOid,
        headRepository: recovery.prRepository,
        baseRepository: recovery.prRepository,
      };
    }

    // An explicitly supplied legacy integration gate remains authoritative;
    // the normal proof order below is local ancestry/patch, then GitHub.
    if (deps.integrationCheck) {
      const checked = await deps.integrationCheck(
        branchName,
        repository,
        {},
        {
          registry: deps.registry,
          mergedBranches: deps.mergedBranches,
        },
      );
      if (checked.ok) {
        return {
          kind: "merged_to_default" as const,
          branch: branchName,
          defaultBranch,
          head,
          evidence: "legacy integration check",
        };
      }
      if (checked.reason !== "branch_not_merged") return undefined;
    }

    // Proof order is intentional: local ancestry/patch equivalence is
    // authoritative and cheap; GitHub is only consulted for squash cases.
    const localProof = await proveLocalBranchIntegration(
      branchName,
      head,
      defaultBranch,
      repository,
      operation,
    );
    if (localProof) return localProof;

    if (deps.mergedBranches) {
      const merged = await deps.mergedBranches(defaultBranch, repository);
      if (
        merged
          .map((item) => item.replace(/^[*+ ]+/, "").trim())
          .includes(branchName)
      )
        return {
          kind: "merged_to_default" as const,
          branch: branchName,
          defaultBranch,
          head,
          evidence: `git branch --merged ${defaultBranch}`,
        };
    }

    const proof = deps.prMergeEvidence
      ? await deps.prMergeEvidence(branchName, repository, operation)
      : await getPrMergedBranchIntegration(
          branchName,
          defaultBranch,
          { ...deps, projectRoot: repository },
          operation,
        );
    if (proof.ok) {
      appendDebugLog(
        "worktree-delete",
        `verified squash PR merge for ${branchName} via PR #${proof.prNumber} (${proof.proof})`,
      );
      return {
        kind: "pr_merged" as const,
        branch: branchName,
        defaultBranch,
        head,
        evidence: `merged PR #${proof.prNumber}${proof.prUrl ? ` (${proof.prUrl})` : ""}`,
        prNumber: proof.prNumber,
        prHeadOid: proof.headRefOid,
        ...(proof.mergeCommitOid
          ? { mergeCommitOid: proof.mergeCommitOid }
          : {}),
        headRepository: proof.headRepository,
        baseRepository: proof.baseRepository,
      };
    }
    if (!proof.classification) return undefined;
    if (proof.classification === "repair")
      return {
        ok: false as const,
        classification: "repair" as const,
        reason: "integration_proof_unavailable" as const,
        message: `${proof.reason}: ${proof.hint}`,
      } satisfies WorktreeDeletionIntegrationFailure;
    const reason =
      proof.reason === "no_pr_evidence"
        ? "pr_not_found"
        : proof.reason === "pr_not_merged"
          ? "pr_not_merged"
          : proof.reason === "local_has_commits_after_pr_head"
            ? "local_commits_after_pr_head"
            : proof.reason === "pr_merge_commit_unreachable"
              ? "pr_merge_commit_unreachable"
              : "pr_evidence_invalid";
    return {
      ok: false as const,
      classification: "refusal" as const,
      reason,
      message: `${proof.reason}: ${proof.hint}`,
    } satisfies WorktreeDeletionIntegrationFailure;
  };
  const planner =
    deps.deletionPlanner ??
    createWorktreeDeletionPlanner({
      census: deps.census,
      isWorktreeInUse: deps.isWorktreeInUse,
      terminalProof,
      integrationProof,
      statePathResolver: deps.statePathResolver
        ? (_repository, id) => deps.statePathResolver!(id)
        : undefined,
    });

  if (opts.dryRun) {
    const planned = await planner.plan({
      repository: deps.projectRoot,
      branch,
      changeId,
      cwd: process.cwd(),
      registry: deps.registry,
      force: opts.force === true,
      budgetMs: deps.operationTimeoutMs,
      operation,
      ...(deps.archiveRecovery
        ? { archiveRecovery: deps.archiveRecovery }
        : {}),
    });
    return plannerResultToDeleteResult(branch, planned);
  }
  if (!opts.planToken)
    return {
      ok: false,
      error: "PLAN_REQUIRED",
      reason:
        "A destructive worktree deletion requires a planner-issued plan token.",
      hint: "Call adv_worktree_delete with dryRun:true, then apply the returned planToken with approvalEvidence.",
    };
  if (!opts.approvalEvidence?.trim())
    return {
      ok: false,
      error: "APPROVAL_REQUIRED",
      reason:
        "Nonblank approvalEvidence is required before destructive deletion.",
      hint: "Re-apply the returned planToken with explicit user approval evidence.",
    };

  let payload: ReturnType<typeof decodeWorktreeDeletionToken>;
  try {
    payload = decodeWorktreeDeletionToken(opts.planToken);
  } catch {
    return {
      ok: false,
      error: "DELETION_BLOCKED",
      status: "invalid_plan",
      reason: "The supplied planToken is malformed.",
      branch,
      hint: "Request a new dry-run plan.",
    };
  }
  if (
    payload.facts.branch !== branch ||
    payload.facts.repository !== path.resolve(deps.projectRoot)
  )
    return {
      ok: false,
      error: "DELETION_BLOCKED",
      status: "drifted",
      reason:
        "The supplied planToken is bound to a different branch or repository.",
      branch,
      hint: "Request a fresh dry-run plan for this exact target.",
    };
  const plan = WorktreeDeletionPlanSchema.parse({
    version: "wdp1",
    repository: payload.facts.repository,
    facts: payload.facts,
    expiresAt: payload.expiresAt,
    token: opts.planToken,
    ...(payload.force !== undefined ? { force: payload.force } : {}),
    ...(payload.integration ? { integration: payload.integration } : {}),
    ...(payload.terminal ? { terminal: payload.terminal } : {}),
    ...(payload.removalMode ? { removalMode: payload.removalMode } : {}),
    ...(payload.archiveRecovery
      ? { archiveRecovery: payload.archiveRecovery }
      : {}),
  });
  if (changeId && !deps.registry?.some((entry) => entry.branch === branch)) {
    appendDebugLog(
      "worktree-delete",
      `missing-registry change branch ${branch} approved through Git census and terminal proof`,
    );
  }
  const hooks =
    deps.hooks ?? (await loadWorktreeConfig(deps.projectRoot, deps.log)).hooks;
  const executor = deps.deletionExecutor ?? executeWorktreeDeletion;
  if (plan.force === true) {
    appendDebugLog(
      "worktree-delete",
      `force-removing dirty worktree ${branch} after explicit approval evidence`,
    );
    if (!deps.registry?.some((entry) => entry.branch === branch)) {
      appendDebugLog(
        "worktree-delete",
        `force-deleting non-registered branch ${branch} after explicit approval evidence`,
      );
    }
  }
  const result = await executor(
    {
      plan,
      repository: deps.projectRoot,
      cwd: process.cwd(),
      hooks: hooks.preDelete,
      budgetMs: deps.operationTimeoutMs,
      operation,
    },
    {
      repository: deps.projectRoot,
      cwd: process.cwd(),
      hooks: hooks.preDelete,
      budgetMs: deps.operationTimeoutMs,
      operation,
      isWorktreeInUse: deps.isWorktreeInUse,
      census: deps.census,
      terminalProof,
      integrationProof,
      beforeRemove: createWorktreeBeforeRemoveStage(
        async ({ operation: sharedOperation }) => {
          const workspace = await cleanupOpenCodeWorkspaceForWorktree(
            plan.facts.worktree,
            branch,
            deps,
            sharedOperation,
          );
          if (!workspace.ok)
            return {
              ok: false as const,
              status: "repair_required" as const,
              reason: workspace.reason,
            };
          return {
            ok: true as const,
            ...(workspace.warning ? { warning: workspace.warning } : {}),
          };
        },
      ),
      reconcileAfterDeletion: createWorktreeReconciliationStage(
        async ({ operation: sharedOperation }) => {
          sharedOperation.throwIfAborted("reconciliation_aborted");
          await reapEmptyWorktreeParents(
            plan.facts.worktree,
            getWorktreeBase(deps.database.projectId),
            sharedOperation.signal,
          );
          sharedOperation.throwIfAborted("reconciliation_aborted");
          await clearPendingDelete(deps.database, branch);
        },
      ),
    },
  );
  if (result.ok)
    return {
      ok: true,
      status: "deleted",
      branch,
      path: plan.facts.worktree,
      ...(result.warning ? { warning: result.warning } : {}),
    };
  if (result.status === "already_absent")
    return {
      ok: false,
      error: "ALREADY_ABSENT",
      status: result.status,
      reason: result.reason,
      branch,
      path: plan.facts.worktree,
    };
  if (result.status === "deadline_exceeded")
    return {
      ok: false,
      error: "DEADLINE_EXCEEDED",
      status: result.status,
      reason: result.reason,
      stage: result.stage,
      branch,
      path: plan.facts.worktree,
    };
  return {
    ok: false,
    error: "DELETION_BLOCKED",
    status: result.status,
    reason: result.reason,
    stage: result.stage,
    branch,
    path: plan.facts.worktree,
    hint: "Request a fresh plan after resolving the reported blocker.",
  };
}

export async function advWorktreeDelete(
  branch: string,
  opts: {
    force?: boolean;
    dryRun?: boolean;
    planToken?: string;
    approvalEvidence?: string;
  } = {},
  deps: AdvWorktreeDeleteDeps,
): Promise<AdvWorktreeDeleteResult> {
  const ownsOperation = deps.operation === undefined;
  const operation =
    deps.operation ??
    createWorktreeOperationContext({
      budgetMs: deps.operationTimeoutMs,
    });
  try {
    return await advWorktreeDeleteShared(branch, opts, {
      ...deps,
      operation,
    });
  } finally {
    if (ownsOperation) {
      await operation.abort("operation_complete");
      operation.dispose();
    }
  }
}

// =============================================================================
// FILE SYNC MODULE
// =============================================================================

/**
 * Validate that a path is safe (no escape from base directory)
 */
function isPathSafe(filePath: string, baseDir: string, log: Logger): boolean {
  // Reject absolute paths
  if (path.isAbsolute(filePath)) {
    log.warn(`[worktree] Rejected absolute path: ${filePath}`);
    return false;
  }
  // Reject obvious path traversal
  if (filePath.includes("..")) {
    log.warn(`[worktree] Rejected path traversal: ${filePath}`);
    return false;
  }
  // Verify resolved path stays within base directory
  const resolved = path.resolve(baseDir, filePath);
  if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
    log.warn(`[worktree] Path escapes base directory: ${filePath}`);
    return false;
  }
  return true;
}

/**
 * Copy files from source directory to target directory.
 * Skips missing files silently (production pattern).
 */
async function copyFiles(
  sourceDir: string,
  targetDir: string,
  files: string[],
  log: Logger,
): Promise<void> {
  for (const file of files) {
    if (!isPathSafe(file, sourceDir, log)) continue;

    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    try {
      const sourceStat = await stat(sourcePath).catch(() => null);
      if (!sourceStat?.isFile()) {
        log.debug(`[worktree] Skipping missing file: ${file}`);
        continue;
      }

      // Ensure target directory exists
      const targetFileDir = path.dirname(targetPath);
      await mkdir(targetFileDir, { recursive: true });

      await copyFile(sourcePath, targetPath);
      log.info(`[worktree] Copied: ${file}`);
    } catch (error) {
      const isNotFound =
        error instanceof Error &&
        (error.message.includes("ENOENT") ||
          error.message.includes("no such file"));
      if (isNotFound) {
        log.debug(`[worktree] Skipping missing: ${file}`);
      } else {
        log.warn(`[worktree] Failed to copy ${file}: ${error}`);
      }
    }
  }
}

/**
 * Create symlinks for directories from source to target.
 * Uses absolute paths for symlink targets.
 */
async function symlinkDirs(
  sourceDir: string,
  targetDir: string,
  dirs: string[],
  log: Logger,
): Promise<void> {
  for (const dir of dirs) {
    if (!isPathSafe(dir, sourceDir, log)) continue;

    const sourcePath = path.join(sourceDir, dir);
    const targetPath = path.join(targetDir, dir);

    try {
      // Check if source directory exists
      const fileStat = await stat(sourcePath).catch(() => null);
      if (!fileStat || !fileStat.isDirectory()) {
        log.debug(`[worktree] Skipping missing directory: ${dir}`);
        continue;
      }

      // Ensure parent directory exists
      const targetParentDir = path.dirname(targetPath);
      await mkdir(targetParentDir, { recursive: true });

      // Remove existing target if it exists (might be empty dir from git)
      await rm(targetPath, { recursive: true, force: true });

      // Create symlink (use absolute path for source)
      await symlink(sourcePath, targetPath, "dir");
      log.info(`[worktree] Symlinked: ${dir}`);
    } catch (error) {
      log.warn(`[worktree] Failed to symlink ${dir}: ${error}`);
    }
  }
}

/**
 * Load worktree-specific configuration from .opencode/worktree.jsonc
 * Auto-creates config file with helpful defaults if it doesn't exist.
 */
export async function loadWorktreeConfig(
  directory: string,
  log: Logger,
): Promise<WorktreeConfig> {
  const configPath = path.join(directory, ".opencode", "worktree.jsonc");

  try {
    try {
      await access(configPath);
    } catch {
      // Auto-create config with helpful defaults and comments
      const defaultConfig = `{
  "$schema": "https://registry.kdco.dev/schemas/worktree.json",

  // Worktree plugin configuration
  // Documentation: https://github.com/kdcokenny/ocx

  // Worktree session mode:
  // - "warp" (default): register the ADV worktree as an OpenCode workspace
  //   and warp this session into it. Requires OPENCODE_EXPERIMENTAL_WORKSPACES=true.
  // - "terminal": stay in this session and use workdir= per tool (legacy inline behavior).
  // - "spawn": open a new terminal with a forked OpenCode session (legacy non-inline behavior).
  // "mode": "warp",

  // Deprecated: "inline": true maps to "mode": "terminal"; false maps to "mode": "spawn".

  "sync": {
    // Files to copy from main worktree to new worktrees
    // Example: [".env", ".env.local", "dev.sqlite"]
    "copyFiles": [],

    // Directories to symlink (saves disk space)
    // Example: ["node_modules"]
    "symlinkDirs": [],

    // Patterns to exclude from copying
    "exclude": []
  },

  "hooks": {
    // Commands to run after worktree creation
    // Example: ["pnpm install", "docker compose up -d"]
    "postCreate": [],

    // Commands to run before worktree deletion
    // Example: ["docker compose down"]
    "preDelete": []
  }
}
`;
      // Ensure .opencode directory exists
      await mkdir(path.join(directory, ".opencode"), { recursive: true });
      await writeFile(configPath, defaultConfig);
      log.info(`[worktree] Created default config: ${configPath}`);
      return normalizeWorktreeConfig({});
    }

    const content = await readFile(configPath, "utf8");
    // Use proper JSONC parser (handles comments in strings correctly)
    const parsed = parseJsonc(content);
    if (parsed === undefined) {
      log.error(`[worktree] Invalid worktree.jsonc syntax`);
      return normalizeWorktreeConfig({});
    }
    return normalizeWorktreeConfig(parsed, log);
  } catch (error) {
    log.warn(`[worktree] Failed to load config: ${error}`);
    return normalizeWorktreeConfig({});
  }
}

// =============================================================================
// ADV WORKTREE CLEANUP (extracted for tool-registry wiring, T24)
// =============================================================================

/** Default timeout for each pending-delete item during cleanup (ms). */
const DEFAULT_PENDING_DELETE_ITEM_TIMEOUT_MS = 7_500;

/** Minimum budget needed before starting a mutating delete attempt. */
const MIN_PENDING_DELETE_START_BUDGET_MS = 500;

export interface AdvWorktreeCleanupDeps {
  projectRoot: string;
  database: Database;
  log: Logger;
  dryRun?: boolean;
  /** Approval evidence for an explicitly approved manual cleanup candidate. */
  approvalEvidence?: string;
  store?: Store;
  warpDeps?: WarpDeps;
  /** Automatic triggers use false; manual cleanup defaults to true to bypass retry cap only. */
  forceAttempts?: boolean;
  /** Startup/session.deleted pass false by calling drainPendingDeletes directly. */
  discover?: boolean;
  /** Optional stage observer so tool wrappers can report the in-flight phase on timeout. */
  onStageEnter?: (stage: "discovery" | "drain") => void;
  /** Optional cleanup drain timeout. Defaults to {@link DEFAULT_PENDING_DELETE_ITEM_TIMEOUT_MS}. */
  cleanupItemTimeoutMs?: number;
  /**
   * Optional per-subprocess git bound for the discovery path, forwarded into
   * the delete deps. Tool callers derive this from the clamped tool budget so
   * every git invocation is bounded strictly below it
   * (rq-worktreeBoundedCleanup02).
   */
  gitTimeoutMs?: number;
  /** Injection seam for testing. Defaults to {@link advWorktreeDelete}. */
  deleteWorktree?: typeof advWorktreeDelete;
  /** Injection seam for testing. Defaults to {@link isWorktreeInUse}. */
  isWorktreeInUse?: (worktreePath: string) => boolean;
  /** Injection seam for PR-aware squash-merge cleanup evidence. */
  prMergeEvidence?: AdvWorktreeDeleteDeps["prMergeEvidence"];
}

export interface DrainPendingDeletesOptions {
  /** Manual remediation triggers may ignore the automatic retry cap without forcing dirty deletion. */
  forceAttempts?: boolean;
  /** Preview pending-delete handling without mutating attempts or deleting. */
  dryRun?: boolean;
  /** Optional cleanup drain timeout. Defaults to {@link DEFAULT_PENDING_DELETE_ITEM_TIMEOUT_MS}. */
  cleanupItemTimeoutMs?: number;
  /** Injection seam for testing. Defaults to {@link advWorktreeDelete}. */
  deleteWorktree?: typeof advWorktreeDelete;
}

export interface PendingDeleteDrainResult {
  removed: number;
  retained: number;
  dryRun?: boolean;
}

/**
 * Discover terminal/merged change worktrees that are eligible for the shared
 * pending-delete queue. Discovery records candidates only; deletion remains
 * owned by {@link drainPendingDeletes} and {@link advWorktreeDelete}.
 */
async function discoverTerminalCleanupCandidates(
  trigger: string,
  deps: AdvWorktreeDeleteDeps,
): Promise<number> {
  if (!deps.store) return 0;

  let defaultBranch: string;
  try {
    defaultBranch = await getDefaultBranch(deps.projectRoot);
  } catch (error) {
    deps.log.warn(
      `[worktree] Skipping terminal cleanup discovery during ${trigger} — default branch unresolved: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 0;
  }

  const facts = await scanGitWorkspaceFacts(
    deps.projectRoot,
    defaultBranch,
    deps.gitTimeoutMs,
  );
  let discovered = 0;

  for (const worktree of facts.worktrees) {
    const branch = worktree.branch;
    if (!branch) continue;
    const changeId = inferChangeIdFromBranch(branch);
    if (!changeId) continue;

    let status: string | undefined;
    try {
      const loaded = await readChangeStatusWithCleanupTimeout(
        deps.store,
        changeId,
        deps.signalTimeoutMs ?? DEFAULT_CHANGE_STATUS_READ_TIMEOUT_MS,
      );
      if (loaded.ok) {
        status = loaded.status;
      } else {
        deps.log.warn(
          `[worktree] Skipping terminal cleanup discovery for ${branch} during ${trigger} — change state unavailable: ${loaded.reason}`,
        );
      }
    } catch (error) {
      deps.log.warn(
        `[worktree] Skipping terminal cleanup discovery for ${branch} during ${trigger} — change state unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (status !== "archived" && status !== "closed") {
      // Manual cleanup may use GitHub PR evidence to recover squash-merged
      // orphan worktrees whose ADV state is missing or no longer reachable.
      // Hot-path status/archive cleanup stays store-only to avoid surprise
      // network calls and to preserve existing terminal-state semantics.
      if (trigger === "status" || trigger === "archive") continue;
      const prIntegration = await verifyPrMergedChangeBranchIntegration(
        branch,
        deps,
      );
      if (!prIntegration.ok) continue;
    }

    await setPendingDelete(
      deps.database,
      branch,
      worktree.path,
      `terminal cleanup discovered during ${trigger}`,
    );
    discovered++;
  }

  return discovered;
}

function classifyDeleteResultForPendingDelete(
  result: Exclude<AdvWorktreeDeleteResult, { ok: true }>,
): string {
  switch (result.error) {
    case "WORKTREE_IN_USE":
      return "worktree_in_use";
    case "WORKSPACE_OWNERSHIP_UNCERTAIN":
      return "workspace_ownership_uncertain";
    case "WORKSPACE_CLEANUP_FAILED":
      return "workspace_cleanup_failed";
    case "WORKTREE_NOT_FOUND":
      return "worktree_not_found";
    case "UNCOMMITTED_WORK":
    case "HOOK_INTRODUCED_CHANGES":
      return "dirty_worktree";
    case "INTEGRATION_REQUIRED":
      if ("reason" in result && result.reason === "branch_not_merged") {
        return "branch_not_merged";
      }
      if ("reason" in result && result.reason === "change_not_terminal") {
        return "change_not_terminal";
      }
      return "integration_required";
    case "REMOVE_FAILED":
      return "remove_failed";
    case "HOOK_FAILED":
      return "hook_failed";
    case "INVALID_BRANCH":
      return "invalid_branch";
    default:
      return "other";
  }
}

/**
 * Drain queued pending deletes one item at a time. Each item is locally
 * bounded, in-use worktrees are retained without consuming attempts, missing
 * paths are cleared, and late successful deletes reconcile the queue after a
 * timeout.
 */
export async function drainPendingDeletes(
  trigger: string,
  deps: AdvWorktreeDeleteDeps,
  options: DrainPendingDeletesOptions = {},
): Promise<PendingDeleteDrainResult> {
  const pendingDeletes = await getPendingDeletes(deps.database);
  if (pendingDeletes.length === 0) {
    return {
      removed: 0,
      retained: 0,
      ...(options.dryRun ? { dryRun: true } : {}),
    };
  }

  let removed = 0;
  let retained = 0;
  const worktreeInUseFn = deps.isWorktreeInUse ?? isWorktreeInUse;
  const cleanupStartedAt = Date.now();

  for (const pendingDelete of pendingDeletes) {
    const { path: worktreePath, branch } = pendingDelete;

    if (options.dryRun) {
      retained++;
      continue;
    }

    if (!(await pathExists(worktreePath))) {
      deps.log.warn(
        `[worktree] Clearing pending delete for ${branch} during ${trigger} — worktree path already missing: ${worktreePath}`,
      );
      await clearPendingDelete(deps.database, branch);
      removed++;
      continue;
    }

    if (
      !options.forceAttempts &&
      pendingDelete.attempts >= MAX_PENDING_DELETE_ATTEMPTS
    ) {
      deps.log.warn(
        `[worktree] Skipping pending delete for ${branch} during ${trigger} — max attempts reached (${pendingDelete.attempts}/${MAX_PENDING_DELETE_ATTEMPTS}). Run worktree_cleanup after fixing the underlying issue.`,
      );
      retained++;
      continue;
    }

    if (worktreeInUseFn(worktreePath)) {
      deps.log.warn(
        `[worktree] Skipping worktree removal during ${trigger} — directory still in use: ${worktreePath} (attempts ${pendingDelete.attempts}/${MAX_PENDING_DELETE_ATTEMPTS})`,
      );
      retained++;
      continue;
    }

    const deleteFn = options.deleteWorktree ?? advWorktreeDelete;
    const timeoutMs =
      options.cleanupItemTimeoutMs ?? DEFAULT_PENDING_DELETE_ITEM_TIMEOUT_MS;
    const remainingBudgetMs = Math.max(
      0,
      timeoutMs - (Date.now() - cleanupStartedAt),
    );
    const deleteTimeoutMs = Math.min(timeoutMs, remainingBudgetMs);
    if (deleteTimeoutMs < MIN_PENDING_DELETE_START_BUDGET_MS) {
      deps.log.warn(
        `[worktree] Pending delete for ${branch} skipped during ${trigger} — remaining cleanup budget ${deleteTimeoutMs}ms is below destructive-operation minimum ${MIN_PENDING_DELETE_START_BUDGET_MS}ms`,
      );
      await recordPendingDeleteFailure(
        deps.database,
        branch,
        "TIME_BUDGET_EXHAUSTED",
        "time_budget_exhausted",
      );
      retained++;
      continue;
    }
    if (options.deleteWorktree) {
      const result = await withTimeout(
        options.deleteWorktree(
          branch,
          { force: false },
          {
            ...deps,
            worktreePath,
            operationTimeoutMs: Math.max(
              1,
              deleteTimeoutMs - PENDING_DELETE_RETURN_RESERVE_MS,
            ),
          },
        ),
        deleteTimeoutMs,
        `Pending delete for ${branch} timed out`,
      );
      if (result.ok) {
        await clearPendingDelete(deps.database, branch);
        removed++;
      } else {
        await recordPendingDeleteFailure(
          deps.database,
          branch,
          result.error,
          classifyDeleteResultForPendingDelete(result),
        );
        retained++;
      }
      continue;
    }
    const previewPromise = deleteFn(
      branch,
      { force: false, dryRun: true },
      {
        ...deps,
        worktreePath,
        operationTimeoutMs: Math.max(
          1,
          deleteTimeoutMs - PENDING_DELETE_RETURN_RESERVE_MS,
        ),
      },
    );

    try {
      const preview = await withTimeout(
        previewPromise,
        deleteTimeoutMs,
        `Pending delete plan for ${branch} timed out`,
      );

      if (!preview.ok || !preview.planToken) {
        // Test and embedding seams may provide a legacy delete adapter. The
        // production adapter always returns a planner token, so no public
        // destructive path can use this compatibility branch.
        if (!preview.ok || !options.deleteWorktree) {
          deps.log.warn(
            `[worktree] Could not plan pending delete for ${branch}: ${preview.ok ? "missing plan token" : preview.error}`,
          );
          await recordPendingDeleteFailure(
            deps.database,
            branch,
            preview.ok ? "PLAN_REQUIRED" : preview.error,
            classifyDeleteResultForPendingDelete(
              preview.ok
                ? ({
                    ok: false,
                    error: "DELETION_BLOCKED",
                    status: "invalid_plan",
                    reason: "missing plan token",
                  } as Exclude<AdvWorktreeDeleteResult, { ok: true }>)
                : preview,
            ),
          );
          retained++;
          continue;
        }
        const result = await withTimeout(
          deleteFn(
            branch,
            { force: false },
            {
              ...deps,
              worktreePath,
              operationTimeoutMs: Math.max(
                1,
                deleteTimeoutMs - PENDING_DELETE_RETURN_RESERVE_MS,
              ),
            },
          ),
          deleteTimeoutMs,
          `Pending delete for ${branch} timed out`,
        );
        if (result.ok) {
          await clearPendingDelete(deps.database, branch);
          removed++;
        } else {
          await recordPendingDeleteFailure(
            deps.database,
            branch,
            result.error,
            classifyDeleteResultForPendingDelete(result),
          );
          retained++;
        }
        continue;
      }

      if (options.dryRun) {
        retained++;
        continue;
      }

      const deletePromise = deleteFn(
        branch,
        {
          force: false,
          planToken: preview.planToken,
          approvalEvidence:
            deps.approvalEvidence ??
            `approved pending candidate ${branch} during ${trigger}`,
        },
        {
          ...deps,
          worktreePath,
          operationTimeoutMs: Math.max(
            1,
            deleteTimeoutMs - PENDING_DELETE_RETURN_RESERVE_MS,
          ),
        },
      );
      const result = await withTimeout(
        deletePromise,
        deleteTimeoutMs,
        `Pending delete for ${branch} timed out`,
      );

      if (result.ok) {
        await clearPendingDelete(deps.database, branch);
        removed++;
      } else {
        deps.log.warn(
          `[worktree] Failed pending delete for ${branch}: ${result.error}`,
        );
        await recordPendingDeleteFailure(
          deps.database,
          branch,
          result.error,
          classifyDeleteResultForPendingDelete(result),
        );
        retained++;
      }
    } catch (err) {
      if (!(err instanceof TimeoutError)) throw err;

      // rq-worktreeBoundedCleanup02 AC3/DONT2: on timeout, retain the
      // pending-delete record. Do NOT attach a late-success handler that
      // mutates state after the tool has already reported the timeout to
      // the agent — that creates ambiguous late side-effects the agent
      // cannot reason about.
      deps.log.warn(
        `[worktree] Pending delete for ${branch} timed out after ${deleteTimeoutMs}ms — retaining for retry`,
      );
      await recordPendingDeleteFailure(
        deps.database,
        branch,
        "TIMEOUT",
        "timeout",
      );
      retained++;
    }
  }

  return { removed, retained, ...(options.dryRun ? { dryRun: true } : {}) };
}

/**
 * Run the manual cleanup pipeline: discover newly eligible terminal worktrees,
 * then drain queued pending deletes with per-item bounds. Manual cleanup may
 * bypass the automatic retry cap, but dirty/unmerged/in-use safety gates remain
 * enforced by {@link advWorktreeDelete}.
 */
export async function advWorktreeCleanup(
  reason: string,
  deps: AdvWorktreeCleanupDeps,
): Promise<PendingDeleteDrainResult> {
  const deleteDeps: AdvWorktreeDeleteDeps = {
    projectRoot: deps.projectRoot,
    database: deps.database,
    log: deps.log,
    store: deps.store,
    approvalEvidence: deps.approvalEvidence,
    warpDeps: deps.warpDeps,
    isWorktreeInUse: deps.isWorktreeInUse,
    prMergeEvidence: deps.prMergeEvidence,
    gitTimeoutMs: deps.gitTimeoutMs,
  };

  // Fired inside the gate so a reported stage of "discovery" means discovery
  // actually ran. Firing it unconditionally would claim discovery for dryRun
  // and skipDiscovery passes that never scanned anything.
  if (!deps.dryRun && deps.discover !== false) {
    deps.onStageEnter?.("discovery");
    await discoverTerminalCleanupCandidates(
      reason || "worktree_cleanup",
      deleteDeps,
    );
  }

  if (reason.trim()) {
    appendDebugLog("worktree_cleanup", `retry requested: ${reason.trim()}`);
  }

  deps.onStageEnter?.("drain");
  return drainPendingDeletes("worktree_cleanup", deleteDeps, {
    dryRun: deps.dryRun,
    forceAttempts: deps.forceAttempts ?? true,
    cleanupItemTimeoutMs: deps.cleanupItemTimeoutMs,
    deleteWorktree: deps.deleteWorktree,
  });
}
