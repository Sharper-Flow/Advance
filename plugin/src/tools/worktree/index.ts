/**
 * OCX Worktree Plugin
 *
 * Creates isolated git worktrees for AI development sessions with
 * seamless terminal spawning across macOS, Windows, and Linux.
 *
 * Inspired by opencode-worktree-session by Felix Anhalt
 * https://github.com/felixAnhalt/opencode-worktree-session
 * License: MIT
 *
 * Rewritten for OCX with production-proven patterns.
 */

// T13: SQLite Database type replaced by WorktreeStateAccess token.
// The legacy `Database` symbol survives only as a type alias so the
// large amount of existing code in this file (call sites that pass
// `db` around) keeps compiling. Behavioral rewrites (T9/T10) will
// drop these adapters as flows are migrated to the Temporal-backed
// state module directly.
import type { WorktreeStateAccess as Database } from "./state";
import {
  access,
  copyFile,
  cp,
  mkdir,
  rm,
  rmdir,
  stat,
  symlink,
} from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "child_process";
import { type Plugin, tool } from "@opencode-ai/plugin";
import type { Event } from "@opencode-ai/sdk";
import type { OpencodeClient } from "../../utils/opencode-types";

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
  addSession,
  clearPendingDelete,
  getPendingDeletes,
  getSession,
  getWorktreePath,
  inferChangeIdFromBranch,
  incrementPendingDeleteAttempts,
  initStateDb,
  listWorktrees,
  removeSession,
} from "./state";
import { openTerminal } from "./terminal";
import { runHooksWithSafety, HookFailedError } from "./hooks";
import { appendDebugLog } from "../../utils/debug-log";
import { execGit, getDefaultBranch } from "../../utils/git";
import {
  acquireGitWorktreeFlock,
  releaseGitWorktreeFlock,
} from "../../utils/git-worktree-flock";
import { generateSessionId } from "../../utils/session-id";
import {
  assertPathInsideDirectory,
  getDataHome,
  getExternalRoot,
  getWorktreeBase,
} from "../../utils/project-id";

/** Maximum retries for database initialization */
const DB_MAX_RETRIES = 3;

/** Delay between retry attempts in milliseconds */
const DB_RETRY_DELAY_MS = 100;

/** Maximum depth to traverse session parent chain */
const MAX_SESSION_CHAIN_DEPTH = 10;

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
function isValidBranchName(name: string): boolean {
  // Check for control characters
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  // Check for invalid git ref characters and shell metacharacters
  if (/[~^:?*[\]\\;&|`$()]/.test(name)) return false;
  return true;
}

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
    (name) => isValidBranchName(name),
    "Contains invalid git ref characters",
  )
  .refine(
    (name) => !name.startsWith(".") && !name.endsWith("."),
    "Cannot start or end with dot",
  )
  .refine((name) => !name.endsWith(".lock"), "Cannot end with .lock");

/**
 * Worktree plugin configuration schema.
 * Config file: .opencode/worktree.jsonc
 */
const worktreeConfigSchema = z.object({
  /** When true, skip terminal spawn and session fork — agent works inline via workdir */
  inline: z.boolean().default(true),
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

type WorktreeConfig = z.infer<typeof worktreeConfigSchema>;

// =============================================================================
// BRANCH INTEGRATION & UNCOMMITTED STATE HELPERS (T9)
// =============================================================================

import { verifyBranchIntegration } from "../../utils/branch-integration";

export async function detectUncommittedState(
  worktreePath: string,
): Promise<{ clean: boolean; files: string[] }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
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

async function gitWorktreeRemove(
  repoRoot: string,
  worktreePath: string,
  force?: boolean,
): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    const args = ["worktree", "remove", worktreePath];
    if (force) args.push("--force");
    execFile("git", args, { cwd: repoRoot }, (error, _stdout, stderr) => {
      if (error) {
        resolve(Result.err(stderr.trim() || error.message));
      } else {
        resolve(Result.ok(undefined));
      }
    });
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
): Promise<string[]> {
  const base = path.resolve(worktreeBase);
  let current = path.dirname(path.resolve(removedWorktreePath));
  const removed: string[] = [];

  assertPathInsideDirectory(current, base);

  while (current !== base) {
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

/** Database instance - initialized once per plugin lifecycle */
let db: Database | null = null;

/** Project root path - stored on first initialization */
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

  // T13: SQLite cleanup (wal_checkpoint, close) is no-op now —
  // state lives in the project workflow, not in a local database.
  // Cleanup hooks remain registered for back-compat with future
  // session-shutdown work that may need to flush pending updates.
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
  if (db) return db;

  if (!projectRoot) {
    throw new Error(
      "Database not initialized: projectRoot not set. Call initDb() first.",
    );
  }

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      db = await initStateDb(projectRoot);
      registerCleanupHandlers(db);
      return db;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn(
        `Database init attempt ${attempt}/${DB_MAX_RETRIES} failed: ${lastError.message}`,
      );

      if (attempt < DB_MAX_RETRIES) {
        Bun.sleepSync(DB_RETRY_DELAY_MS);
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

/**
 * Execute a git command safely using child_process.execFile.
 * Avoids shell interpolation entirely by passing args as array.
 * Node-compatible (used in tests); replaces legacy Bun.spawn.
 */
async function git(
  args: string[],
  cwd: string,
): Promise<Result<string, string>> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: 30000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
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
  | { ok: false; error: "BRANCH_LOCKED"; hint: string }
  | { ok: false; error: "GIT_FAILED"; reason: string };

export async function advWorktreeCreate(
  branch: string,
  opts: { base?: string; force?: boolean } = {},
  deps: AdvWorktreeCreateDeps,
): Promise<AdvWorktreeCreateResult> {
  const repoRoot = deps.projectRoot;

  // Step 0: reuse an already-registered git worktree before any
  // project-workflow recovery, stale-basis checks, flock, or git worktree add.
  // This is intentionally git-authoritative: `git worktree list --porcelain`
  // is local, cheap, and remains available when the Temporal worker is stuck.
  const existingWorktree = await findGitWorktreeByBranch(repoRoot, branch);
  if (existingWorktree) {
    if (await pathExists(existingWorktree.path)) {
      const headSha = (
        await execGit(["rev-parse", "HEAD"], existingWorktree.path)
      ).trim();
      return {
        ok: true,
        branch,
        path: existingWorktree.path,
        baseRef: opts.base ?? "existing",
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
  const flockAcquireFn = deps.flock?.acquire ?? acquireGitWorktreeFlock;
  const lock = await flockAcquireFn(projectStateDir);
  if (!lock.owned) {
    return {
      ok: false,
      error: "BRANCH_LOCKED",
      hint: "Another session is creating a worktree; retry in a moment",
    };
  }
  try {
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

    // Step 5: register in worktree_registry.
    const sessionId = generateSessionId();
    await addSession(
      deps.database,
      {
        sessionId,
        branch,
        path: worktreePath,
      },
      undefined,
      inferChangeIdFromBranch(branch),
    );

    // Step 6: postCreate hooks (T12 — best-effort; failure logs but does not abort).
    const hooks = deps.hooks;
    if (hooks?.postCreate?.length) {
      try {
        await runHooksWithSafety("postCreate", worktreePath, hooks.postCreate);
      } catch (err) {
        deps.log.warn(
          `[worktree] postCreate hook failed for ${branch}: ${err}`,
        );
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
    await releaseGitWorktreeFlock(projectStateDir);
  }
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
  worktreePath?: string;
  hooks?: { preDelete: string[] };
  integrationCheck?: typeof verifyBranchIntegration;
}

export type AdvWorktreeDeleteResult =
  | { ok: true; branch: string; path: string }
  | { ok: false; error: "WORKTREE_NOT_FOUND"; branch: string }
  | { ok: false; error: "INTEGRATION_REQUIRED"; reason: string; hint: string }
  | { ok: false; error: "UNCOMMITTED_WORK"; files: string[]; hint: string }
  | { ok: false; error: "HOOK_FAILED"; details: unknown }
  | {
      ok: false;
      error: "HOOK_INTRODUCED_CHANGES";
      files: string[];
      hint: string;
    }
  | { ok: false; error: "REMOVE_FAILED"; reason: string };

export async function advWorktreeDelete(
  branch: string,
  opts: { force?: boolean } = {},
  deps: AdvWorktreeDeleteDeps,
): Promise<AdvWorktreeDeleteResult> {
  // 1. Resolve worktree path
  let worktreePath: string;
  if (deps.worktreePath) {
    worktreePath = deps.worktreePath;
  } else {
    try {
      worktreePath = await getWorktreePath(deps.projectRoot, branch);
    } catch {
      const registry = await listWorktrees(deps.database);
      const record = registry.find((r) => r.branch === branch);
      if (!record) {
        return { ok: false, error: "WORKTREE_NOT_FOUND", branch };
      }
      worktreePath = record.path;
    }
  }

  // 2. Branch integration check
  const integrationFn = deps.integrationCheck ?? verifyBranchIntegration;
  const integration = await integrationFn(branch, deps.projectRoot);
  if (!integration.ok) {
    return {
      ok: false,
      error: "INTEGRATION_REQUIRED",
      reason: integration.reason,
      hint: "Branch must be archived, merged, and clean",
    };
  }

  // 3. Pre-hook uncommitted check
  let preHookStatus: { clean: boolean; files: string[] };
  try {
    preHookStatus = await detectUncommittedState(worktreePath);
  } catch (err) {
    return {
      ok: false,
      error: "UNCOMMITTED_WORK",
      files: [String(err)],
      hint: "Failed to check uncommitted state",
    };
  }
  if (!preHookStatus.clean && !opts.force) {
    return {
      ok: false,
      error: "UNCOMMITTED_WORK",
      files: preHookStatus.files,
      hint: "Commit or stash, or pass opts.force: true with explicit audit reason",
    };
  }

  // 4. Run preDelete hooks
  const hooks =
    deps.hooks ?? (await loadWorktreeConfig(deps.projectRoot, deps.log)).hooks;
  if (hooks.preDelete.length > 0) {
    try {
      await runHooksWithSafety("preDelete", worktreePath, hooks.preDelete);
    } catch (err) {
      if (err instanceof HookFailedError) {
        return { ok: false, error: "HOOK_FAILED", details: err.results };
      }
      throw err;
    }
  }

  // 5. Post-hook re-verification
  let postHookStatus: { clean: boolean; files: string[] };
  try {
    postHookStatus = await detectUncommittedState(worktreePath);
  } catch (err) {
    return {
      ok: false,
      error: "HOOK_INTRODUCED_CHANGES",
      files: [String(err)],
      hint: "Failed to re-check uncommitted state after hooks",
    };
  }
  if (!postHookStatus.clean && !opts.force) {
    return {
      ok: false,
      error: "HOOK_INTRODUCED_CHANGES",
      files: postHookStatus.files,
      hint: "Hook introduced uncommitted changes; review and commit, or pass opts.force: true",
    };
  }

  // 6. Execute git worktree remove
  if (opts.force) {
    appendDebugLog(
      "worktree-delete",
      `force-removing ${branch} at ${worktreePath} (uncommitted=${!preHookStatus.clean})`,
    );
  }
  const removeResult = await gitWorktreeRemove(
    deps.projectRoot,
    worktreePath,
    opts.force,
  );
  if (!removeResult.ok) {
    return { ok: false, error: "REMOVE_FAILED", reason: removeResult.error };
  }

  // 7. Remove from registry
  await removeSession(deps.database, branch);

  // 7.5. Remove empty branch-prefix parents (e.g. `{base}/change`).
  try {
    await reapEmptyWorktreeParents(
      worktreePath,
      getWorktreeBase(deps.database.projectId),
    );
  } catch (err) {
    deps.log.warn(
      `[worktree] Skipped empty-parent cleanup for ${worktreePath}: ${String(err)}`,
    );
  }

  // 8. Return success
  return { ok: true as const, branch, path: worktreePath };
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
      const sourceFile = Bun.file(sourcePath);
      if (!(await sourceFile.exists())) {
        log.debug(`[worktree] Skipping missing file: ${file}`);
        continue;
      }

      // Ensure target directory exists
      const targetFileDir = path.dirname(targetPath);
      await mkdir(targetFileDir, { recursive: true });

      // Copy file
      await Bun.write(targetPath, sourceFile);
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
 * Run hook commands in the worktree directory.
 */
async function runHooks(
  cwd: string,
  commands: string[],
  log: Logger,
): Promise<void> {
  for (const command of commands) {
    log.info(`[worktree] Running hook: ${command}`);
    try {
      // Use shell to properly handle quoted arguments and complex commands
      const result = Bun.spawnSync(["bash", "-c", command], {
        cwd,
        stdout: "inherit",
        stderr: "pipe",
      });
      if (result.exitCode !== 0) {
        const stderr = result.stderr?.toString() || "";
        log.warn(
          `[worktree] Hook failed (exit ${result.exitCode}): ${command}${stderr ? `\n${stderr}` : ""}`,
        );
      }
    } catch (error) {
      log.warn(`[worktree] Hook error: ${error}`);
    }
  }
}

/**
 * Load worktree-specific configuration from .opencode/worktree.jsonc
 * Auto-creates config file with helpful defaults if it doesn't exist.
 */
async function loadWorktreeConfig(
  directory: string,
  log: Logger,
): Promise<WorktreeConfig> {
  const configPath = path.join(directory, ".opencode", "worktree.jsonc");

  try {
    const file = Bun.file(configPath);
    if (!(await file.exists())) {
      // Auto-create config with helpful defaults and comments
      const defaultConfig = `{
  "$schema": "https://registry.kdco.dev/schemas/worktree.json",

  // Worktree plugin configuration
  // Documentation: https://github.com/kdcokenny/ocx

  // Inline mode: agent works in the worktree via workdir instead of
  // spawning a new terminal window with a separate OpenCode instance.
  // Set to false to restore the old behavior (new tmux window / terminal tab).
  // "inline": true,

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
      await Bun.write(configPath, defaultConfig);
      log.info(`[worktree] Created default config: ${configPath}`);
      return worktreeConfigSchema.parse({});
    }

    const content = await file.text();
    // Use proper JSONC parser (handles comments in strings correctly)
    const parsed = parseJsonc(content);
    if (parsed === undefined) {
      log.error(`[worktree] Invalid worktree.jsonc syntax`);
      return worktreeConfigSchema.parse({});
    }
    return worktreeConfigSchema.parse(parsed);
  } catch (error) {
    log.warn(`[worktree] Failed to load config: ${error}`);
    return worktreeConfigSchema.parse({});
  }
}

// =============================================================================
// ADV WORKTREE CLEANUP (extracted for tool-registry wiring, T24)
// =============================================================================

export interface AdvWorktreeCleanupDeps {
  projectRoot: string;
  database: Database;
  log: Logger;
}

export async function advWorktreeCleanup(
  _reason: string,
  deps: AdvWorktreeCleanupDeps,
): Promise<{ removed: number; retained: number }> {
  const pendingDeletes = await getPendingDeletes(deps.database);
  if (pendingDeletes.length === 0) return { removed: 0, retained: 0 };

  let removed = 0;
  let retained = 0;

  for (const pendingDelete of pendingDeletes) {
    const { path: worktreePath, branch } = pendingDelete;

    if (isWorktreeInUse(worktreePath)) {
      deps.log.warn(
        `[worktree] Skipping worktree removal during worktree_cleanup — directory still in use: ${worktreePath} (attempt ${pendingDelete.attempts + 1})`,
      );
      await incrementPendingDeleteAttempts(deps.database, branch);
      retained++;
      continue;
    }

    const result = await advWorktreeDelete(
      branch,
      { force: true },
      {
        projectRoot: deps.projectRoot,
        database: deps.database,
        log: deps.log,
        worktreePath,
      },
    );

    if (result.ok) {
      await clearPendingDelete(deps.database, branch);
      removed++;
    } else {
      deps.log.warn(
        `[worktree] Failed pending delete for ${branch}: ${result.error}`,
      );
      await incrementPendingDeleteAttempts(deps.database, branch);
      retained++;
    }
  }

  return { removed, retained };
}

// =============================================================================
// PLUGIN ENTRY
// =============================================================================

export const WorktreePlugin: Plugin = async (ctx) => {
  const { directory, client } = ctx;

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

  // Initialize SQLite database
  const database = await initDb(directory, log);

  async function processPendingDeletes(
    trigger: string,
    options: { forceAttempts?: boolean } = {},
  ): Promise<{ removed: number; retained: number }> {
    const pendingDeletes = await getPendingDeletes(database);
    if (pendingDeletes.length === 0) return { removed: 0, retained: 0 };

    let removed = 0;
    let retained = 0;

    for (const pendingDelete of pendingDeletes) {
      const { path: worktreePath, branch } = pendingDelete;

      if (
        !options.forceAttempts &&
        pendingDelete.attempts >= MAX_PENDING_DELETE_ATTEMPTS
      ) {
        log.warn(
          `[worktree] Skipping pending delete for ${branch} during ${trigger} — max attempts reached (${pendingDelete.attempts}/${MAX_PENDING_DELETE_ATTEMPTS}). Run worktree_cleanup after fixing the underlying issue.`,
        );
        retained++;
        continue;
      }

      if (isWorktreeInUse(worktreePath)) {
        log.warn(
          `[worktree] Skipping worktree removal during ${trigger} — directory still in use: ${worktreePath} (attempt ${pendingDelete.attempts + 1})`,
        );
        await incrementPendingDeleteAttempts(database, branch);
        retained++;
        continue;
      }

      const result = await advWorktreeDelete(
        branch,
        { force: options.forceAttempts },
        { projectRoot: directory, database, log, worktreePath },
      );

      if (result.ok) {
        await clearPendingDelete(database, branch);
        removed++;
      } else {
        log.warn(
          `[worktree] Failed pending delete for ${branch}: ${result.error}`,
        );
        await incrementPendingDeleteAttempts(database, branch);
        retained++;
      }
    }

    return { removed, retained };
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
              case "GIT_FAILED":
                return `Failed to create worktree: ${createResult.reason}`;
              default: {
                const _exhaustive: never = createResult;
                void _exhaustive;
                return "Failed to create worktree: unknown error";
              }
            }
          }

          const worktreePath = createResult.path;

          // Sync files from main worktree
          const worktreeConfig = await loadWorktreeConfig(directory, log);
          const mainWorktreePath = directory; // The repo root is the main worktree

          // Copy files
          if (worktreeConfig.sync.copyFiles.length > 0) {
            await copyFiles(
              mainWorktreePath,
              worktreePath,
              worktreeConfig.sync.copyFiles,
              log,
            );
          }

          // Symlink directories
          if (worktreeConfig.sync.symlinkDirs.length > 0) {
            await symlinkDirs(
              mainWorktreePath,
              worktreePath,
              worktreeConfig.sync.symlinkDirs,
              log,
            );
          }

          // Run postCreate hooks
          if (worktreeConfig.hooks.postCreate.length > 0) {
            await runHooks(worktreePath, worktreeConfig.hooks.postCreate, log);
          }

          // Inline mode: skip session fork and terminal spawn
          if (worktreeConfig.inline) {
            log.info(
              `[worktree] Inline mode — skipping terminal spawn for ${args.branch}`,
            );

            // Record session for tracking (used by delete flow).
            // T13: addSession now async + sessionId/branch/path shape.
            await addSession(
              database,
              {
                sessionId: `inline:${args.branch}`,
                branch: args.branch,
                path: worktreePath,
              },
              undefined,
              inferChangeIdFromBranch(args.branch),
            );

            return [
              `Worktree created at ${worktreePath}`,
              `Branch: ${args.branch}`,
              ``,
              `IMPORTANT: Inline mode is active. You MUST use workdir="${worktreePath}" for ALL subsequent tool calls (bash, read, edit, glob, grep, etc). Do NOT continue operating in the original directory.`,
            ].join("\n");
          }

          // Fork session with context (replaces --session resume)
          const projectId = await getProjectId(worktreePath, client);
          const { forkedSession, planCopied, delegationsCopied } =
            await forkWithContext(
              client,
              toolCtx.sessionID,
              projectId,
              async (sid) => {
                // Walk up parentID chain to find root session
                let currentId = sid;
                for (let depth = 0; depth < MAX_SESSION_CHAIN_DEPTH; depth++) {
                  const session = await client.session.get({
                    path: { id: currentId },
                  });
                  if (!session.data?.parentID) return currentId;
                  currentId = session.data.parentID;
                }
                return currentId;
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

          // Record session for tracking (used by delete flow).
          // T13: addSession now async + sessionId/branch/path shape.
          await addSession(
            database,
            {
              sessionId: forkedSession.id,
              branch: args.branch,
              path: worktreePath,
            },
            undefined,
            inferChangeIdFromBranch(args.branch),
          );

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
              "Branch name of the worktree to delete (required in inline mode)",
            ),
          force: tool.schema
            .boolean()
            .optional()
            .describe(
              "Force removal even with uncommitted changes (requires explicit audit reason)",
            ),
        },
        async execute(args, toolCtx) {
          const worktreeConfig = await loadWorktreeConfig(directory, log);

          // Find the worktree session record. T13: getSession now async.
          const session = worktreeConfig.inline
            ? await (async () => {
                // Inline mode: look up by "inline:<branch>" key
                if (!args.branch) {
                  return null;
                }
                return getSession(database, `inline:${args.branch}`);
              })()
            : await getSession(database, toolCtx?.sessionID ?? "");

          if (worktreeConfig.inline && !args.branch) {
            return `In inline mode, you must provide the branch name of the worktree to delete.`;
          }

          if (!session) {
            return `No worktree found${args.branch ? ` for branch "${args.branch}"` : " associated with this session"}`;
          }

          const result = await advWorktreeDelete(
            session.branch,
            { force: args.force ?? false },
            {
              projectRoot: directory,
              database,
              log,
              worktreePath: session.path,
            },
          );

          if (result.ok) {
            return `Worktree removed on branch "${result.branch}".`;
          }

          switch (result.error) {
            case "WORKTREE_NOT_FOUND":
              return `Worktree not found for branch "${result.branch}".`;
            case "INTEGRATION_REQUIRED":
              return `Integration required: ${result.reason}. ${result.hint}`;
            case "UNCOMMITTED_WORK":
              return `Uncommitted work detected:\n${result.files.join("\n")}\n\n${result.hint}`;
            case "HOOK_FAILED":
              return `Pre-delete hook failed. Details: ${JSON.stringify(result.details)}`;
            case "HOOK_INTRODUCED_CHANGES":
              return `Hook introduced uncommitted changes:\n${result.files.join("\n")}\n\n${result.hint}`;
            case "REMOVE_FAILED":
              return `Failed to remove worktree: ${result.reason}`;
            default:
              return `Delete failed: ${(result as { error: string }).error}`;
          }
        },
      }),

      worktree_cleanup: tool({
        description:
          "Retry queued worktree deletions. Safe: skips worktrees still used as a process CWD and keeps them queued.",
        args: {
          reason: tool.schema
            .string()
            .describe(
              "Brief explanation of why you are retrying queued cleanup",
            ),
        },
        async execute() {
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
