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
  cp,
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
import { type Plugin, tool } from "@opencode-ai/plugin";
import type {
  OpencodeClient,
  OpencodeEvent as Event,
} from "../../utils/opencode-types";
import { resolveRootSessionId } from "../../utils/session-principal";

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
// T7 relocation shim: ADV's getProjectId returns string|null, the kdco
// signature was (cwd, client?) → string. Wrap to keep call sites unchanged.
async function getProjectId(
  directory: string,
  _client?: unknown,
): Promise<string> {
  const id = await getProjectIdRaw(directory);
  if (!id)
    throw new Error(
      `getProjectId: unable to resolve project id for ${directory}`,
    );
  return id;
}
import { isWorktreeInUse } from "./in-use";
import {
  clearPendingDelete,
  getPendingDeletes,
  getWorktreeRecord,
  getWorktreePath,
  findBranchOwnersAcrossChanges,
  initStateDb,
  recordPendingDeleteFailure,
  setPendingDelete,
} from "./state";
import { inferChangeIdFromBranch } from "./branch-parser";
import { openTerminal } from "./terminal";
import { scanGitWorkspaceFacts } from "./census";
import {
  decodeWorktreeDeletionToken,
  WorktreeDeletionPlanSchema,
  type WorktreeDeletionPlan,
} from "./deletion-contracts";
import {
  createWorktreeDeletionPlanner,
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
  getDataHome,
  getExternalRoot,
  getWorktreeBase,
} from "../../utils/project-id";
import {
  createAdvWorkspace,
  deleteAdvWorkspace,
  findWorkspaceByDirectoryChecked,
  getSessionWorkspaceID,
  warpFlagEnabled,
  warpSession,
  workspaceAndWarpAvailable,
  type WarpDeps,
} from "../../utils/workspace-warp";
import type { Store } from "../../storage/store";
import { withTimeout, TimeoutError } from "../../utils/with-timeout";
import { execGh } from "../../integrations/gh-cli";
import { proveLocalBranchIntegration } from "../../utils/branch-integration";
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
  applyWorktreeDeletion,
  executeDeletion,
} from "./deletion-executor";

/** Maximum retries for worktree state initialization */
const DB_MAX_RETRIES = 3;

/** Delay between retry attempts in milliseconds */
const DB_RETRY_DELAY_MS = 100;

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

// =============================================================================
// ERROR TYPES
// =============================================================================

class WorktreeError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(`${operation}: ${message}`);
    this.name = "WorktreeError";
  }
}

// =============================================================================
// SESSION FORKING HELPERS
// =============================================================================

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

/**
 * Copy file if source exists. Returns true if copied, false if source doesn't exist.
 * Throws on copy failure (Law 4: Fail Loud)
 */
async function copyIfExists(src: string, dest: string): Promise<boolean> {
  if (!(await pathExists(src))) return false;
  await copyFile(src, dest);
  return true;
}

/**
 * Copy directory contents if source exists.
 * @param src - Source directory path
 * @param dest - Destination directory path
 * @returns true if copy was performed, false if source doesn't exist
 */
async function copyDirIfExists(src: string, dest: string): Promise<boolean> {
  if (!(await pathExists(src))) return false;
  await cp(src, dest, { recursive: true });
  return true;
}

interface ForkResult {
  forkedSession: { id: string };
  rootSessionId: string;
  planCopied: boolean;
  delegationsCopied: boolean;
}

/**
 * Fork a session and copy associated plans/delegations.
 * Cleans up forked session on failure (atomic operation).
 */
async function forkWithContext(
  client: OpencodeClient,
  sessionId: string,
  projectId: string,
  getRootSessionIdFn: (sessionId: string) => Promise<string>,
): Promise<ForkResult> {
  // Guard clauses (Law 1)
  if (!client) throw new WorktreeError("client is required", "forkWithContext");
  if (!sessionId)
    throw new WorktreeError("sessionId is required", "forkWithContext");
  if (!projectId)
    throw new WorktreeError("projectId is required", "forkWithContext");

  // Get root session ID with error wrapping
  let rootSessionId: string;
  try {
    rootSessionId = await getRootSessionIdFn(sessionId);
  } catch (e) {
    throw new WorktreeError(
      "Failed to get root session ID",
      "forkWithContext",
      e,
    );
  }

  // Fork session
  const forkedSessionResponse = await client.session.fork({
    path: { id: sessionId },
    body: {},
  });
  const forkedSession = forkedSessionResponse.data;
  if (!forkedSession?.id) {
    throw new WorktreeError(
      "Failed to fork session: no session data returned",
      "forkWithContext",
    );
  }

  // Copy data with cleanup on failure
  let planCopied: boolean;
  let delegationsCopied: boolean;

  try {
    const dataHome = getDataHome();
    const workspaceBase = path.join(dataHome, "opencode", "workspace");
    const delegationsBase = path.join(dataHome, "opencode", "delegations");

    const destWorkspaceDir = path.join(
      workspaceBase,
      projectId,
      forkedSession.id,
    );
    const destDelegationsDir = path.join(
      delegationsBase,
      projectId,
      forkedSession.id,
    );

    await mkdir(destWorkspaceDir, { recursive: true });
    await mkdir(destDelegationsDir, { recursive: true });

    // Copy plan
    const srcPlan = path.join(
      workspaceBase,
      projectId,
      rootSessionId,
      "plan.md",
    );
    const destPlan = path.join(destWorkspaceDir, "plan.md");
    planCopied = await copyIfExists(srcPlan, destPlan);

    // Copy delegations
    const srcDelegations = path.join(delegationsBase, projectId, rootSessionId);
    delegationsCopied = await copyDirIfExists(
      srcDelegations,
      destDelegationsDir,
    );
  } catch (error) {
    client.app
      .log({
        body: {
          service: "worktree",
          level: "error",
          message: `forkWithContext: Copy failed, cleaning up forked session: ${error}`,
        },
      })
      .catch(() => {});
    // Clean up orphaned directories
    const dataHome = getDataHome();
    const workspaceBase = path.join(dataHome, "opencode", "workspace");
    const delegationsBase = path.join(dataHome, "opencode", "delegations");
    const destWorkspaceDir = path.join(
      workspaceBase,
      projectId,
      forkedSession.id,
    );
    const destDelegationsDir = path.join(
      delegationsBase,
      projectId,
      forkedSession.id,
    );
    await rm(destWorkspaceDir, { recursive: true, force: true }).catch((e) => {
      client.app
        .log({
          body: {
            service: "worktree",
            level: "error",
            message: `forkWithContext: Failed to clean up workspace dir ${destWorkspaceDir}: ${e}`,
          },
        })
        .catch(() => {});
    });
    await rm(destDelegationsDir, { recursive: true, force: true }).catch(
      (e) => {
        client.app
          .log({
            body: {
              service: "worktree",
              level: "error",
              message: `forkWithContext: Failed to clean up delegations dir ${destDelegationsDir}: ${e}`,
            },
          })
          .catch(() => {});
      },
    );
    await client.session
      .delete({ path: { id: forkedSession.id } })
      .catch((e: unknown) => {
        client.app
          .log({
            body: {
              service: "worktree",
              level: "error",
              message: `forkWithContext: Failed to clean up forked session ${forkedSession.id}: ${e}`,
            },
          })
          .catch(() => {});
      });
    throw new WorktreeError(
      `Failed to copy session data: ${error instanceof Error ? error.message : String(error)}`,
      "forkWithContext",
      error,
    );
  }

  return { forkedSession, rootSessionId, planCopied, delegationsCopied };
}

// =============================================================================
// MODULE-LEVEL STATE
// =============================================================================

/**
 * Project root path for the current plugin initialization.
 *
 * WorktreePlugin can be initialized more than once in a host process. Keep
 * this value current so local Git queries never inherit a prior plugin's CWD.
 */
let projectRoot: string | null = null;

/** Flag to prevent duplicate cleanup handler registration */
let cleanupRegistered = false;

/**
 * Register process cleanup handlers for graceful database shutdown.
 * Ensures WAL checkpoint and proper close on process termination.
 *
 * NOTE: process.once() is an EventEmitter method that never throws.
 * The boolean guard is defense-in-depth for idempotency, not error recovery.
 *
 * @param database - The database instance to clean up
 */
function registerCleanupHandlers(_database: Database): void {
  if (cleanupRegistered) return; // Early exit guard
  cleanupRegistered = true;

  // State access is external-project keyed; process cleanup has no local handle
  // to close, but the lifecycle hooks remain idempotent for plugin shutdown.
  const cleanup = () => {
    // no-op
  };

  process.once("SIGTERM", cleanup);
  process.once("SIGINT", cleanup);
  process.once("beforeExit", cleanup);
}

/**
 * Get the database instance, initializing if needed.
 * Includes retry logic for transient initialization failures.
 *
 * @returns Database instance
 * @throws {Error} if initialization fails after all retries
 */
async function getDb(log: Logger): Promise<Database> {
  if (!projectRoot) {
    throw new Error(
      "Database not initialized: projectRoot not set. Call initDb() first.",
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      const database = await initStateDb(projectRoot);
      registerCleanupHandlers(database);
      return database;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn(
        `Database init attempt ${attempt}/${DB_MAX_RETRIES} failed: ${lastError.message}`,
      );

      if (attempt < DB_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(
    `Failed to initialize database after ${DB_MAX_RETRIES} attempts: ${lastError?.message}`,
  );
}

/**
 * Initialize the database with the project root path.
 * Must be called once before any getDb() calls.
 */
async function initDb(root: string, log: Logger): Promise<Database> {
  projectRoot = root;
  return getDb(log);
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
): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFileGitCb(
      args,
      {
        cwd,
        timeout: timeoutMs,
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
  ) => Promise<PrMergedBranchIntegrationResult>;
  /** Lightweight path resolver used by the shared planner's terminal proof. */
  statePathResolver?: (changeId: string) => Promise<string | undefined>;
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
    }
  | {
      ok: false;
      reason: string;
      hint: string;
      details?: string[];
    };

interface GhPullRequestSummary {
  number?: number;
  state?: string;
  mergedAt?: string | null;
  headRefOid?: string | null;
  url?: string;
}

async function getPrMergedBranchIntegration(
  branch: string,
  deps: AdvWorktreeDeleteDeps,
): Promise<PrMergedBranchIntegrationResult> {
  if (!branch.startsWith("change/")) {
    return {
      ok: false,
      reason: "branch_not_change_branch",
      hint: "PR-aware squash cleanup is limited to ADV change/* branches.",
    };
  }

  if (deps.prMergeEvidence) {
    return deps.prMergeEvidence(branch, deps.projectRoot);
  }

  const localHead = await git(
    ["rev-parse", branch],
    deps.projectRoot,
    deps.gitTimeoutMs,
  );
  if (!localHead.ok) {
    return {
      ok: false,
      reason: "local_branch_missing",
      hint: `Local branch ${branch} does not exist or cannot be resolved.`,
      details: [localHead.error],
    };
  }

  const prList = await execGh(
    [
      "pr",
      "list",
      "--state",
      "all",
      "--head",
      branch,
      "--limit",
      "20",
      "--json",
      "number,state,mergedAt,headRefOid,url",
    ],
    deps.projectRoot,
    deps.prEvidenceTimeoutMs ?? DEFAULT_CHANGE_STATUS_READ_TIMEOUT_MS,
  );
  if (prList.exitCode !== 0) {
    return {
      ok: false,
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
      reason: "gh_json_invalid",
      hint: `GitHub PR evidence for ${branch} was not valid JSON; retaining worktree.`,
      details: [error instanceof Error ? error.message : String(error)],
    };
  }

  if (prs.length === 0) {
    return {
      ok: false,
      reason: "no_pr_evidence",
      hint: `No GitHub PR found for ${branch}; retaining worktree.`,
    };
  }

  const mergedPrs = prs.filter(
    (pr) => Boolean(pr.mergedAt) && typeof pr.headRefOid === "string",
  );
  if (mergedPrs.length === 0) {
    return {
      ok: false,
      reason: "pr_not_merged",
      hint: `GitHub PR for ${branch} is not merged; retaining worktree.`,
      details: prs.map(
        (pr) => `PR #${pr.number ?? "?"}: ${pr.state ?? "unknown"}`,
      ),
    };
  }

  const localHeadSha = localHead.value.trim();
  for (const pr of mergedPrs) {
    if (pr.number && pr.headRefOid === localHeadSha) {
      return {
        ok: true,
        proof: "pr-head-exact",
        prNumber: pr.number,
        prUrl: pr.url,
        headRefOid: pr.headRefOid,
      };
    }
  }

  for (const pr of mergedPrs) {
    if (!pr.number || !pr.headRefOid) continue;
    const fetch = await git(
      ["fetch", "origin", `refs/pull/${pr.number}/head`],
      deps.projectRoot,
      deps.gitTimeoutMs,
    );
    if (!fetch.ok) continue;
    const ancestor = await git(
      ["merge-base", "--is-ancestor", branch, "FETCH_HEAD"],
      deps.projectRoot,
      deps.gitTimeoutMs,
    );
    if (ancestor.ok) {
      return {
        ok: true,
        proof: "local-ancestor-of-pr-head",
        prNumber: pr.number,
        prUrl: pr.url,
        headRefOid: pr.headRefOid,
      };
    }
  }

  return {
    ok: false,
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
  const pr = await getPrMergedBranchIntegration(branch, deps);
  if (pr.ok) {
    appendDebugLog(
      "worktree-delete",
      `verified squash PR merge for ${branch} via PR #${pr.prNumber} (${pr.proof})`,
    );
    return { ok: true };
  }
  return { ok: false, reason: pr.reason, hint: pr.hint };
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
  if (
    result.reason === "worktree_not_found" ||
    result.reason === "branch_not_found"
  )
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
  const integrationProof =
    deps.integrationCheck || deps.prMergeEvidence || deps.mergedBranches
      ? async (
          branchName: string,
          head: string,
          defaultBranch: string,
          repository: string,
          operation: WorktreeOperationContext,
        ) => {
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
          if (deps.prMergeEvidence) {
            const proof = await deps.prMergeEvidence(branchName, repository);
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
              };
            }
          }
          return proveLocalBranchIntegration(
            branchName,
            head,
            defaultBranch,
            repository,
            operation,
          );
        }
      : undefined;
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
      repositoryLeaseDir: path.join(deps.projectRoot, ".adv"),
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

async function resolveEffectiveWorktreeMode(
  requestedMode: WorktreeMode,
  warpDeps: WarpDeps,
  _client: OpencodeClient,
  sessionID: string,
  log: Logger,
): Promise<{ mode: WorktreeMode } | { mode: "blocked"; message: string }> {
  if (requestedMode !== "warp") return { mode: requestedMode };

  if (!warpFlagEnabled()) {
    log.warn(
      "[worktree] mode:warp unavailable because OpenCode workspace sync is not enabled. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true (or OPENCODE_EXPERIMENTAL=true) and restart OpenCode to enable workspace warp; falling back to mode:terminal.",
    );
    return { mode: "terminal" };
  }

  // T5 (fixWarpSessionLookup) — consolidated session lookup. The shared utility
  // routes through the SDK client packed into warpDeps; the `_client` param is
  // retained for back-compat with the legacy WorktreePlugin entry signature.
  const lookup = await getSessionWorkspaceID(warpDeps, sessionID);
  if (!lookup.ok) {
    log.warn(
      `[worktree] mode:warp unavailable because current session lookup failed (${lookup.detail}); falling back to mode:terminal.`,
    );
    return { mode: "terminal" };
  }
  if (lookup.workspaceID) {
    return {
      mode: "blocked",
      message: [
        `[ADV:BLOCKED] Cannot create worktree while session is already warped.`,
        `Session ${sessionID} is in workspace ${lookup.workspaceID}.`,
        `Open a fresh OpenCode session from the trunk checkout to create a new worktree.`,
      ].join("\n"),
    };
  }

  if (!(await workspaceAndWarpAvailable(warpDeps))) {
    log.warn(
      "[worktree] mode:warp unavailable because /experimental/workspace is not reachable. Set OPENCODE_EXPERIMENTAL_WORKSPACES=true and restart OpenCode, or use mode:terminal; falling back to mode:terminal.",
    );
    return { mode: "terminal" };
  }

  return { mode: "warp" };
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

// =============================================================================
// PLUGIN ENTRY
// =============================================================================

export const WorktreePlugin: Plugin = async (ctx) => {
  const { directory, client, serverUrl } = ctx;

  const log = {
    debug: (msg: string) =>
      client.app
        .log({ body: { service: "worktree", level: "debug", message: msg } })
        .catch(() => {}),
    info: (msg: string) =>
      client.app
        .log({ body: { service: "worktree", level: "info", message: msg } })
        .catch(() => {}),
    warn: (msg: string) =>
      client.app
        .log({ body: { service: "worktree", level: "warn", message: msg } })
        .catch(() => {}),
    error: (msg: string) =>
      client.app
        .log({ body: { service: "worktree", level: "error", message: msg } })
        .catch(() => {}),
  };

  // Initialize worktree state access
  const database = await initDb(directory, log);
  const warpDeps: WarpDeps = { serverUrl, directory, client };

  try {
    const cleanup = await drainPendingDeletes(
      "startup",
      {
        projectRoot: directory,
        database,
        log,
        warpDeps,
      },
      { forceAttempts: false },
    );
    if (cleanup.removed > 0 || cleanup.retained > 0) {
      log.info(
        `[worktree] Startup pending-delete drain complete. Removed ${cleanup.removed}, retained ${cleanup.retained}.`,
      );
    }
  } catch (error) {
    log.warn(
      `[worktree] Startup pending-delete drain failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  async function processPendingDeletes(
    trigger: string,
    options: { forceAttempts?: boolean } = {},
  ): Promise<{ removed: number; retained: number }> {
    return drainPendingDeletes(
      trigger,
      {
        projectRoot: directory,
        database,
        log,
        warpDeps,
      },
      options,
    );
  }

  return {
    tool: {
      worktree_create: tool({
        description:
          "Create a new git worktree for isolated development. When inline mode is enabled in .opencode/worktree.jsonc, returns the worktree path for the agent to use via workdir. Otherwise opens a new terminal with OpenCode in the worktree.",
        args: {
          branch: tool.schema
            .string()
            .describe(
              "Branch name for the worktree (e.g., 'feature/dark-mode')",
            ),
          baseBranch: tool.schema
            .string()
            .optional()
            .describe("Base branch to create from (defaults to HEAD)"),
        },
        async execute(args, toolCtx) {
          // Validate branch name at boundary
          const branchResult = branchNameSchema.safeParse(args.branch);
          if (!branchResult.success) {
            return `❌ Invalid branch name: ${branchResult.error.issues[0]?.message}`;
          }

          // Validate base branch name at boundary
          if (args.baseBranch) {
            const baseResult = branchNameSchema.safeParse(args.baseBranch);
            if (!baseResult.success) {
              return `❌ Invalid base branch name: ${baseResult.error.issues[0]?.message}`;
            }
          }

          const worktreeConfig = await loadWorktreeConfig(directory, log);
          const warpDeps: WarpDeps = { serverUrl, directory, client };
          const modeResolution = await resolveEffectiveWorktreeMode(
            worktreeConfig.mode,
            warpDeps,
            client,
            toolCtx.sessionID,
            log,
          );
          if (modeResolution.mode === "blocked") {
            return modeResolution.message;
          }
          const effectiveMode = modeResolution.mode;

          // Create worktree using ADV-safe flow (T10)
          const createResult = await advWorktreeCreate(
            args.branch,
            { base: args.baseBranch },
            { projectRoot: directory, database, log },
          );
          if (!createResult.ok) {
            switch (createResult.error) {
              case "DEFAULT_BRANCH_UNRESOLVABLE":
                return `Failed to create worktree: default branch unresolvable. ${createResult.hint}`;
              case "STALE_BASE":
                return `Failed to create worktree: base branch is stale. ${createResult.reason}. ${createResult.suggestion}`;
              case "BRANCH_LOCKED":
                return `Failed to create worktree: ${createResult.hint}`;
              case "BRANCH_IN_USE":
                return `Failed to create worktree: branch ${createResult.branch} is already registered by active change workflow(s): ${createResult.ownerChangeIds.join(", ")}. ${createResult.hint}`;
              case "GIT_FAILED":
                return `Failed to create worktree: ${createResult.reason}`;
              case "SETUP_FAILED":
                return `Failed to create worktree: setup failed for ${createResult.branch} at ${createResult.path}. ${createResult.reason}`;
              case "INVALID_BRANCH":
                return `Failed to create worktree: invalid branch. ${createResult.reason}`;
              default: {
                // Exhaustiveness check — TS errors here if a new variant
                // is added to AdvWorktreeCreateResult without updating
                // this switch.
                const _exhaustive: never = createResult;
                return `Failed to create worktree: unknown error (${String(_exhaustive)})`;
              }
            }
          }

          const worktreePath = createResult.path;

          switch (effectiveMode) {
            case "warp": {
              let workspaceID: string | undefined;
              let workspaceCleanupFailed: string | undefined;
              try {
                const created = await createAdvWorkspace(warpDeps, {
                  directory: worktreePath,
                  branch: args.branch,
                });
                workspaceID = created.workspaceID;
                await warpSession(warpDeps, {
                  workspaceID,
                  sessionID: toolCtx.sessionID,
                });
              } catch (error) {
                if (workspaceID) {
                  try {
                    await deleteAdvWorkspace(warpDeps, workspaceID);
                  } catch (cleanupError) {
                    workspaceCleanupFailed = String(cleanupError);
                    log.warn(
                      `[worktree] Warp failed AND orphan workspace cleanup failed for ${workspaceID}: ${cleanupError}`,
                    );
                  }
                }
                const cleanupMessage = workspaceCleanupFailed
                  ? `OpenCode workspace cleanup also failed (${workspaceCleanupFailed}); manual cleanup may be required`
                  : "cleaned up any created OpenCode workspace";

                log.warn(
                  `[worktree] mode:warp failed after creating the git worktree (${error}); ${cleanupMessage}; falling back to mode:terminal.`,
                );

                return [
                  `Worktree created at ${worktreePath}`,
                  `Branch: ${args.branch}`,
                  ``,
                  `mode:warp failed after creating the git worktree; ${cleanupMessage}. Falling back to mode:terminal.`,
                  `IMPORTANT: Terminal mode is active. You MUST use workdir="${worktreePath}" for ALL subsequent tool calls (bash, read, edit, glob, grep, etc). Do NOT continue operating in the original directory.`,
                ].join("\n");
              }

              return [
                `Worktree created at ${worktreePath}`,
                `Branch: ${args.branch}`,
                ``,
                `Session warped to workspace ${workspaceID}.`,
                `Subsequent tool calls operate with the worktree as the project root — no per-tool workdir override needed.`,
              ].join("\n");
            }
            case "terminal": {
              log.info(
                `[worktree] Terminal mode — skipping terminal spawn for ${args.branch}`,
              );

              return [
                `Worktree created at ${worktreePath}`,
                `Branch: ${args.branch}`,
                ``,
                `IMPORTANT: Terminal mode is active. You MUST use workdir="${worktreePath}" for ALL subsequent tool calls (bash, read, edit, glob, grep, etc). Do NOT continue operating in the original directory.`,
              ].join("\n");
            }
            case "spawn":
              break;
            default: {
              const _exhaustive: never = effectiveMode;
              return `Failed to create worktree: unknown mode (${String(_exhaustive)})`;
            }
          }

          // Fork session with context (replaces --session resume)
          const projectId = await getProjectId(worktreePath, client);
          const { forkedSession, planCopied, delegationsCopied } =
            await forkWithContext(
              client,
              toolCtx.sessionID,
              projectId,
              async (sid) => {
                const root = await resolveRootSessionId({
                  callerSessionID: sid,
                  client,
                });
                if (!root) {
                  throw new WorktreeError(
                    "Failed to resolve root session ID from ancestry",
                    "forkWithContext",
                  );
                }
                return root;
              },
            );

          log.debug(
            `Forked session ${forkedSession.id}, plan: ${planCopied}, delegations: ${delegationsCopied}`,
          );

          // Spawn worktree with forked session
          const terminalResult = await openTerminal(
            worktreePath,
            `opencode --session ${forkedSession.id}`,
            args.branch,
          );

          if (!terminalResult.success) {
            log.warn(
              `[worktree] Failed to open terminal: ${terminalResult.error}`,
            );
          }

          return `Worktree created at ${worktreePath}\n\nA new terminal has been opened with OpenCode.`;
        },
      }),

      worktree_delete: tool({
        description:
          "Delete a worktree and clean up. In inline mode, provide the branch name to identify which worktree to delete.",
        args: {
          reason: tool.schema
            .string()
            .describe("Brief explanation of why you are calling this tool"),
          branch: tool.schema
            .string()
            .optional()
            .describe(
              "Branch name of the worktree to delete (required now that the retired session registry no longer maps sessions to branches)",
            ),
          force: tool.schema
            .boolean()
            .optional()
            .describe(
              "Force removal even with uncommitted changes (requires explicit audit reason)",
            ),
          dryRun: tool.schema
            .boolean()
            .optional()
            .describe(
              "Return a typed deletion plan without removing the worktree",
            ),
          planToken: tool.schema
            .string()
            .optional()
            .describe("Plan token returned by the dry-run deletion request"),
          approvalEvidence: tool.schema
            .string()
            .optional()
            .describe("Explicit approval evidence for the exact plan token"),
        },
        async execute(args, _toolCtx) {
          const worktreeConfig = await loadWorktreeConfig(directory, log);

          if (worktreeConfig.inline && !args.branch) {
            return `In inline mode, you must provide the branch name of the worktree to delete.`;
          }

          // The session registry is retired; branch-addressed deletes are the
          // only structural path. A branch is required to locate the worktree.
          if (!args.branch) {
            return `No worktree found associated with this session`;
          }

          const result = await advWorktreeDelete(
            args.branch,
            {
              force: args.force ?? false,
              dryRun: args.dryRun,
              planToken: args.planToken,
              approvalEvidence: args.approvalEvidence,
            },
            {
              projectRoot: directory,
              database,
              log,
              warpDeps: { serverUrl, directory, client },
            },
          );

          if (result.ok) {
            return [
              `Worktree removed on branch "${result.branch}".`,
              result.warning ? `Warning: ${result.warning}` : undefined,
            ]
              .filter(Boolean)
              .join("\n");
          }

          switch (result.error) {
            case "WORKTREE_NOT_FOUND":
              return `Worktree not found for branch "${result.branch}".`;
            case "WORKTREE_IN_USE":
              return `Worktree still in use at ${result.path}. ${result.hint}`;
            case "INVALID_BRANCH":
              return `Invalid branch: ${result.reason}`;
            case "INTEGRATION_REQUIRED":
              return `Integration required: ${result.reason}. ${result.hint}`;
            case "UNCOMMITTED_WORK":
              return `Uncommitted work detected:\n${result.files.join("\n")}\n\n${result.hint}`;
            case "HOOK_FAILED":
              return `Pre-delete hook failed. Details: ${JSON.stringify(result.details)}`;
            case "HOOK_INTRODUCED_CHANGES":
              return `Hook introduced uncommitted changes:\n${result.files.join("\n")}\n\n${result.hint}`;
            case "WORKSPACE_OWNERSHIP_UNCERTAIN":
              return `Retained worktree "${result.branch}" at ${result.path} — OpenCode workspace ownership uncertain. ${result.hint}`;
            case "WORKSPACE_CLEANUP_FAILED":
              return `Retained worktree "${result.branch}" at ${result.path} — OpenCode workspace cleanup failed. ${result.hint}`;
            case "REMOVE_FAILED":
              return `Failed to remove worktree: ${result.reason}`;
            default:
              return `Delete failed: ${(result as { error: string }).error}`;
          }
        },
      }),

      worktree_cleanup: tool({
        description:
          "Retry queued worktree deletions. Safe: skips worktrees still used as a process CWD, preserves dirty/unmerged unsafe worktrees, and keeps retained items queued.",
        args: {
          reason: tool.schema
            .string()
            .describe(
              "Brief explanation of why you are retrying queued cleanup",
            ),
        },
        async execute(args) {
          if (args.reason.trim()) {
            appendDebugLog(
              "worktree_cleanup",
              `plugin cleanup requested: ${args.reason.trim()}`,
            );
          }
          const cleanup = await processPendingDeletes("worktree_cleanup", {
            forceAttempts: true,
          });
          return `Worktree cleanup complete. Removed ${cleanup.removed}, retained ${cleanup.retained}.`;
        },
      }),
    },

    event: async ({ event }: { event: Event }): Promise<void> => {
      // ---------------------------------------------------------------------------
      // session.idle: handle pending SPAWN only — never touch pending deletes here.
      // Worktree deletion on session.idle was the root cause of the CWD race
      // condition: the shell's CWD could be deleted while it was still active.
      // ---------------------------------------------------------------------------
      if (event.type === "session.idle") {
        // Spawn handling is done elsewhere; nothing to do for deletes on idle.
        return;
      }

      // ---------------------------------------------------------------------------
      // session.deleted: safe to attempt worktree cleanup.
      // The session terminal is gone, but we still guard against the case where
      // another process (e.g. the spawning shell) has the worktree as its CWD.
      // ---------------------------------------------------------------------------
      if (event.type === "session.deleted") {
        await processPendingDeletes("session.deleted");
      }
    },
  };
};

export default WorktreePlugin;
