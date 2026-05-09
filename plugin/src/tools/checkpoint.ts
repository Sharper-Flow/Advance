/**
 * Task Checkpoint Tool
 *
 * Provides `adv_task_checkpoint` — creates a git commit checkpoint for a task
 * before it transitions to `done` or `cancelled`. The `/adv-apply` command
 * calls this at step 3c.5 between the Green Phase and task completion.
 *
 * Design decisions:
 * - Uses argv-based `execFile` (NOT shell-string `exec`) matching
 *   `project-id.ts` / `terminal.ts` patterns.
 * - Hardened environment: GIT_EDITOR=true, GIT_PAGER=cat,
 *   GIT_TERMINAL_PROMPT=0.
 * - Staging: `git add -A` respects `.gitignore`.
 * - Commit message: `task(tk-xxxx): <title>` for complete,
 *   `task(tk-xxxx): cancel — <reason>` for cancel.
 * - Idempotent on clean trees: returns {status:'clean'} without committing.
 * - Persists touched_files and error_class bridge via store.tasks.update.
 */

import { execFile } from "child_process";
import { access } from "fs/promises";
import { isAbsolute, resolve } from "path";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import type { ErrorRecovery } from "../types";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import { fireSignalAndRefresh, getChangeHandle } from "./_adapters";
import { taskCompletedSignal } from "../temporal/messages";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const SUBJECT_MAX_LEN = 72;
const CANCEL_REASON_MAX_LEN = 64;

/** Enable verbose checkpoint diagnostics. Set ADV_DEBUG=1 in env. */
const ADV_DEBUG = process.env.ADV_DEBUG === "1";

const GIT_ENV = {
  GIT_EDITOR: "true",
  GIT_PAGER: "cat",
  GIT_TERMINAL_PROMPT: "0",
} as const;

// ─── Types ──────────────────────────────────────────────────────────────────

interface CheckpointResult {
  status: "clean" | "committed" | "failed";
  sha?: string;
  branch?: string;
  workdir: string;
  classification?: "SEMANTIC" | "ENVIRONMENTAL" | "TRANSIENT";
  message?: string;
  stderr?: string;
  gitExitCode?: number;
  error?: string;
  changeId?: string;
  gitRoot?: string;
  expectedBranch?: string;
  actualBranch?: string;
  expectedHeadSha?: string;
  actualHeadSha?: string;
  checkpointRecorded?: boolean;
  remediation?: string;
  /** Repo-relative paths of files modified in this checkpoint */
  touched_files?: string[];
}

type ErrorClass = "SEMANTIC" | "ENVIRONMENTAL" | "TRANSIENT";

export type RepoState =
  | "ok"
  | "detached"
  | "merging"
  | "rebasing"
  | "cherry-picking"
  | "reverting"
  | "not_git";

// ─── Internal helpers (exported for testability) ────────────────────────────

/**
 * Run a git command via argv-based execFile.
 * Rejects on non-zero exit or spawn failure.
 */
export function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      args,
      {
        cwd,
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: DEFAULT_MAX_BUFFER,
        env: { ...process.env, ...GIT_ENV },
      },
      (error, stdout, stderr) => {
        if (error) {
          const exitCode = error.errno ?? (error.killed ? -1 : 1);
          reject(
            Object.assign(new Error(error.message), {
              stdout: stdout ?? "",
              stderr: stderr ?? "",
              exitCode,
              killed: error.killed ?? false,
            }),
          );
        } else {
          resolve({
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            exitCode: 0,
          });
        }
      },
    );
  });
}

async function gitPathExists(
  cwd: string,
  gitPathName: string,
): Promise<boolean> {
  try {
    const gitPath = (
      await runGit(["rev-parse", "--git-path", gitPathName], cwd)
    ).stdout.trim();
    if (!gitPath) return false;
    await access(isAbsolute(gitPath) ? gitPath : resolve(cwd, gitPath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the state of the git repo. Returns:
 * - "ok" — normal repo on a branch
 * - "detached" — detached HEAD
 * - "merging" — MERGE_HEAD exists
 * - "rebasing" — REBASE_HEAD or rebase state directory exists
 * - "cherry-picking" — CHERRY_PICK_HEAD exists
 * - "reverting" — REVERT_HEAD exists
 * - "not_git" — not a git repo (or git unavailable)
 */
export async function detectRepoState(cwd: string): Promise<RepoState> {
  try {
    // Check if we're in a git repo
    await runGit(["rev-parse", "--git-dir"], cwd);
  } catch {
    return "not_git";
  }

  try {
    // Check for detached HEAD (symbolic ref fails when detached)
    await runGit(["symbolic-ref", "-q", "HEAD"], cwd);
  } catch {
    return "detached";
  }

  try {
    // Check for MERGE_HEAD
    await runGit(["rev-parse", "--verify", "MERGE_HEAD"], cwd);
    return "merging";
  } catch {
    // MERGE_HEAD doesn't exist — normal state
  }

  try {
    await runGit(["rev-parse", "--verify", "REBASE_HEAD"], cwd);
    return "rebasing";
  } catch {
    // REBASE_HEAD doesn't exist — check rebase state directories below
  }

  if (
    (await gitPathExists(cwd, "rebase-merge")) ||
    (await gitPathExists(cwd, "rebase-apply"))
  ) {
    return "rebasing";
  }

  try {
    await runGit(["rev-parse", "--verify", "CHERRY_PICK_HEAD"], cwd);
    return "cherry-picking";
  } catch {
    // CHERRY_PICK_HEAD doesn't exist — normal state so far
  }

  try {
    await runGit(["rev-parse", "--verify", "REVERT_HEAD"], cwd);
    return "reverting";
  } catch {
    // REVERT_HEAD doesn't exist — normal state
  }

  return "ok";
}

/**
 * Classify a git error into SEMANTIC, ENVIRONMENTAL, or TRANSIENT.
 */
export function classifyGitError(error: unknown): ErrorClass {
  if (!(error instanceof Error)) return "ENVIRONMENTAL";

  const msg = error.message.toLowerCase();
  const stderr = (error as { stderr?: string }).stderr?.toLowerCase() ?? "";

  // TRANSIENT: lock file contention
  if (
    msg.includes("index.lock") ||
    stderr.includes("index.lock") ||
    (msg.includes("unable to create") && msg.includes(".lock"))
  ) {
    return "TRANSIENT";
  }

  // SEMANTIC: pre-commit hook rejection, merge conflict, etc
  const exitCode = (error as { exitCode?: number }).exitCode ?? 1;
  if (exitCode === 1) {
    // Hook rejections, merge conflicts, etc produce exit code 1
    if (
      msg.includes("hook") ||
      stderr.includes("hook") ||
      msg.includes("merge") ||
      stderr.includes("conflict")
    ) {
      return "SEMANTIC";
    }
  }

  // Default to SEMANTIC for any non-zero exit from git
  if (exitCode > 0) return "SEMANTIC";

  return "ENVIRONMENTAL";
}

/**
 * Build commit message with structured body/trailers.
 * Complete: `task(tk-xxxx): completed` (subject ≤ 72)
 * Cancel:   `task(tk-xxxx): cancel — <reason>` (reason ≤ 64)
 */
export function buildCommitMessage(
  taskId: string,
  mode: "complete" | "cancel",
  reason?: string,
  changeId?: string,
  verification?: string,
): { subject: string; body: string } {
  let subject: string;
  if (mode === "cancel") {
    const prefix = `task(${taskId}): cancel \u2014 `;
    const maxReason = Math.min(
      CANCEL_REASON_MAX_LEN,
      SUBJECT_MAX_LEN - prefix.length,
    );
    const truncatedReason = (reason ?? "").slice(0, Math.max(0, maxReason));
    subject = `${prefix}${truncatedReason}`;
  } else {
    subject = `task(${taskId}): completed`.slice(0, SUBJECT_MAX_LEN);
  }

  const lines: string[] = [];
  if (changeId) lines.push(`Change: ${changeId}`);
  lines.push(`Task: ${taskId}`);
  lines.push(`Mode: ${mode}`);
  if (verification) lines.push(`Verification: ${verification}`);

  const body = lines.join("\n");
  return { subject, body };
}

// rq-cc01: Verified Checkpoint Ordering
// rq-cc02: Scope Guard
// rq-cc03: Audit Metadata
// rq-cc04: Dirty-Baseline Protection
// rq-cc05: No-Publication Authority
// rq-checkpointLedger01: checkpointRecorded:false blocks task completion

// ─── Error-class bridge helper ──────────────────────────────────────────────

/**
 * Bridge checkpoint error classification to the task's error_recovery field.
 * Non-blocking — errors are logged but never prevent the checkpoint result
 * from returning.
 */
async function bridgeErrorClass(
  store: Store,
  taskId: string,
  errorClass: "SEMANTIC" | "ENVIRONMENTAL" | "TRANSIENT",
  errorMessage: string,
): Promise<void> {
  try {
    const task = await store.tasks.get(taskId);
    if (!task) return;
    const existing = task.error_recovery;
    const updatedRecovery: ErrorRecovery = {
      last_error: errorMessage.slice(0, 200),
      retry_count: existing?.retry_count ?? 0,
      max_retries: existing?.max_retries ?? 3,
      error_class: errorClass,
      ...(existing?.next_strategy
        ? { next_strategy: existing.next_strategy }
        : {}),
      ...(existing?.attempts ? { attempts: existing.attempts } : {}),
    };
    await store.tasks.update(
      taskId,
      task.status,
      undefined,
      undefined,
      updatedRecovery,
    );
  } catch (err) {
    if (ADV_DEBUG) {
      console.warn("[checkpoint] error_class bridge failed (non-fatal):", err);
    }
  }
}

async function resolveChangeId(
  store: Store,
  taskId: string,
): Promise<string | null> {
  const result = await store.tasks.show(taskId);
  return result?.changeId ?? null;
}

async function getHandleForChangeId(
  store: Store,
  changeId: string,
): Promise<ReturnType<typeof getChangeHandle>> {
  const bundle = getService();
  if (!bundle) {
    throw new Error("Temporal service not available");
  }
  const projectId = await getProjectId(store.paths.root);
  if (!projectId) {
    throw new Error("Could not resolve project ID");
  }
  return getChangeHandle(bundle.client, projectId, changeId);
}

async function fireTaskCompletedFromCheckpoint(
  store: Store,
  taskId: string,
  sha: string,
  verification: string,
  touchedFiles: string[],
): Promise<void> {
  try {
    const changeId = await resolveChangeId(store, taskId);
    if (!changeId) return;
    const handle = await getHandleForChangeId(store, changeId);
    // Uses fireSignalAndRefresh (rq-cacheRefresh01) so the in-memory
    // changeCache is invalidated after the signal fires — without this,
    // the very next adv_change_show / adv_change_archive read returns
    // stale state with the task still pending.
    await fireSignalAndRefresh(handle, store, changeId, taskCompletedSignal, {
      taskId,
      verification,
      summary: "Task checkpoint completed",
      filesTouched: touchedFiles,
      checkpointSha: sha,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (ADV_DEBUG) {
      console.warn(
        "[checkpoint] taskCompletedSignal fire failed (non-fatal):",
        err,
      );
    }
  }
}

// ─── Tool definition ────────────────────────────────────────────────────────

export const checkpointTools = {
  adv_task_checkpoint: {
    description:
      "Create a git commit checkpoint for a task before marking it done or cancelled. " +
      "Returns {status:'clean'} if nothing to commit, {status:'committed'} after creating a commit, " +
      "or {status:'failed'} with a classification for errors.",
    args: {
      taskId: z.string().describe("Task ID to checkpoint"),
      workdir: z
        .string()
        .optional()
        .describe("Working directory (overrides default)"),
      mode: z
        .enum(["complete", "cancel"])
        .optional()
        .describe("Checkpoint mode: 'complete' (default) or 'cancel'"),
      reason: z
        .string()
        .optional()
        .describe("Reason for cancellation (required when mode='cancel')"),
      changeId: z
        .string()
        .optional()
        .describe(
          "Optional change ID assertion — must match derived change from task",
        ),
      expectedBranch: z
        .string()
        .optional()
        .describe("Expected git branch (default: change/{changeId})"),
      expectedHeadSha: z
        .string()
        .optional()
        .describe("Expected HEAD SHA for baseline validation"),
      verification: z
        .string()
        .optional()
        .describe(
          "Verification summary for complete mode (required when committing dirty tree)",
        ),
    },
    execute: async (
      args: {
        taskId: string;
        workdir?: string;
        mode?: "complete" | "cancel";
        reason?: string;
        changeId?: string;
        expectedBranch?: string;
        expectedHeadSha?: string;
        verification?: string;
      },
      store: Store,
      defaultWorkdir: string,
    ): Promise<string> => {
      const cwd = args.workdir || defaultWorkdir;
      const mode = args.mode ?? "complete";

      // Validate cancel mode requires reason
      if (mode === "cancel" && !args.reason) {
        return formatToolOutput({
          error:
            "Cancel mode requires a 'reason' argument. " +
            "Provide the cancellation reason for the commit message.",
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
        } satisfies CheckpointResult);
      }

      // Detect repo state
      const repoState = await detectRepoState(cwd);
      if (repoState === "not_git") {
        return formatToolOutput({
          status: "failed",
          classification: "ENVIRONMENTAL",
          workdir: cwd,
        } satisfies CheckpointResult);
      }
      if (repoState === "detached") {
        return formatToolOutput({
          status: "failed",
          classification: "ENVIRONMENTAL",
          workdir: cwd,
          message: "Detached HEAD — cannot checkpoint without a branch",
        } satisfies CheckpointResult);
      }
      if (repoState === "merging") {
        return formatToolOutput({
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
          message:
            "MERGE_HEAD present — resolve merge conflict before checkpoint",
        } satisfies CheckpointResult);
      }

      // Resolve change identity from store
      let derivedChangeId: string | undefined;
      try {
        const taskInfo = await store.tasks.show(args.taskId);
        if (taskInfo) {
          derivedChangeId = taskInfo.changeId;
        }
      } catch {
        // If store doesn't support tasks.show, continue without derived changeId
      }

      // Determine if guard mode is active (explicit guard params passed)
      const guardMode = !!(
        args.changeId ||
        args.expectedBranch ||
        args.expectedHeadSha ||
        args.verification
      );

      // Validate optional changeId assertion
      if (
        args.changeId &&
        derivedChangeId &&
        args.changeId !== derivedChangeId
      ) {
        return formatToolOutput({
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
          error: `changeId mismatch: expected ${args.changeId} but task ${args.taskId} belongs to change ${derivedChangeId}`,
          changeId: derivedChangeId,
        } satisfies CheckpointResult);
      }

      const effectiveChangeId = args.changeId || derivedChangeId;
      const expectedBranch =
        args.expectedBranch ||
        (guardMode && effectiveChangeId
          ? `change/${effectiveChangeId}`
          : undefined);

      // Compute git context
      let actualBranch: string;
      let actualHeadSha: string;
      let gitRoot: string;
      try {
        actualBranch = (
          await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)
        ).stdout.trim();
        actualHeadSha = (
          await runGit(["rev-parse", "HEAD"], cwd)
        ).stdout.trim();
        gitRoot = (
          await runGit(["rev-parse", "--show-toplevel"], cwd)
        ).stdout.trim();
      } catch (err) {
        return formatToolOutput({
          status: "failed",
          classification: classifyGitError(err),
          workdir: cwd,
          stderr: err instanceof Error ? err.message : String(err),
        } satisfies CheckpointResult);
      }

      // Validate branch match
      if (expectedBranch && actualBranch !== expectedBranch) {
        return formatToolOutput({
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
          gitRoot,
          error:
            `branch mismatch: expected ${expectedBranch} but currently on ${actualBranch}. ` +
            `Run in the correct worktree for change ${effectiveChangeId || args.taskId}.`,
          expectedBranch,
          actualBranch,
        } satisfies CheckpointResult);
      }

      // Validate HEAD match
      if (args.expectedHeadSha && actualHeadSha !== args.expectedHeadSha) {
        return formatToolOutput({
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
          gitRoot,
          error:
            `HEAD mismatch: expected ${args.expectedHeadSha} but HEAD is ${actualHeadSha}. ` +
            `The working tree may have been modified outside this task.`,
          expectedHeadSha: args.expectedHeadSha,
          actualHeadSha,
        } satisfies CheckpointResult);
      }

      // Check if working tree is clean
      let statusOutput: string;
      try {
        const { stdout } = await runGit(["status", "--porcelain"], cwd);
        statusOutput = stdout;
      } catch (err) {
        return formatToolOutput({
          status: "failed",
          classification: classifyGitError(err),
          workdir: cwd,
          gitRoot,
          stderr: err instanceof Error ? err.message : String(err),
        } satisfies CheckpointResult);
      }

      if (statusOutput.trim() === "") {
        // Clean tree — idempotent, no commit needed
        // For complete mode, fire taskCompletedSignal so the task is marked done
        if (mode === "complete") {
          await fireTaskCompletedFromCheckpoint(
            store,
            args.taskId,
            actualHeadSha,
            args.verification ?? "Clean tree checkpoint",
            [],
          );
        }
        return formatToolOutput({
          status: "clean",
          sha: actualHeadSha,
          branch: actualBranch,
          workdir: cwd,
          gitRoot,
          changeId: derivedChangeId,
          checkpointRecorded: true,
        } satisfies CheckpointResult);
      }

      // Dirty tree — require verification for complete mode
      if (mode === "complete" && !args.verification) {
        return formatToolOutput({
          status: "failed",
          classification: "SEMANTIC",
          workdir: cwd,
          gitRoot,
          error:
            "Verification required for complete mode checkpoint on dirty tree. " +
            "Provide the verification summary (e.g., test command that passed).",
        } satisfies CheckpointResult);
      }

      // Build commit message with structured body
      const { subject, body } = buildCommitMessage(
        args.taskId,
        mode,
        args.reason,
        derivedChangeId,
        args.verification,
      );

      try {
        // Stage
        await runGit(["add", "-A"], cwd);

        // Commit with retry for transient lock contention
        const maxRetries = 2;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            await runGit(["commit", "-m", subject, "-m", body], cwd);
            break;
          } catch (err) {
            const cls = classifyGitError(err);
            if (cls === "TRANSIENT" && attempt < maxRetries - 1) {
              // Brief pause before retry
              await new Promise((r) => setTimeout(r, 500));
              continue;
            }
            // Non-transient or exhausted retries
            const gitErr = err as {
              stderr?: string;
              exitCode?: number;
              message: string;
            };
            // Bridge error_class to task's error_recovery
            await bridgeErrorClass(
              store,
              args.taskId,
              cls === "TRANSIENT" ? "SEMANTIC" : cls,
              gitErr.stderr ?? gitErr.message,
            );
            return formatToolOutput({
              status: "failed",
              classification: cls === "TRANSIENT" ? "SEMANTIC" : cls,
              workdir: cwd,
              gitRoot,
              message: subject,
              stderr: gitErr.stderr ?? gitErr.message,
              gitExitCode: gitErr.exitCode,
            } satisfies CheckpointResult);
          }
        }

        // Commit succeeded — get SHA
        const { stdout: sha } = await runGit(["rev-parse", "HEAD"], cwd);

        // Compute touched files from diff (repo-relative paths)
        let touchedFiles: string[] = [];
        try {
          const { stdout: diffOutput } = await runGit(
            ["diff", "--name-only", "HEAD~1"],
            cwd,
          );
          touchedFiles = diffOutput
            .split("\n")
            .map((f) => f.trim())
            .filter((f) => f.length > 0);
        } catch {
          // Diff failed (e.g., initial commit) — use empty array
          touchedFiles = [];
        }

        // For complete mode, fire taskCompletedSignal to mark task done
        if (mode === "complete") {
          await fireTaskCompletedFromCheckpoint(
            store,
            args.taskId,
            sha.trim(),
            args.verification ?? "Checkpoint committed",
            touchedFiles,
          );
        }

        return formatToolOutput({
          status: "committed",
          sha: sha.trim(),
          branch: actualBranch,
          workdir: cwd,
          gitRoot,
          message: subject,
          changeId: derivedChangeId,
          checkpointRecorded: true,
          touched_files: touchedFiles,
        } satisfies CheckpointResult);
      } catch (err) {
        const cls = classifyGitError(err);
        // Bridge error_class to task's error_recovery
        await bridgeErrorClass(
          store,
          args.taskId,
          cls,
          err instanceof Error ? err.message : String(err),
        );
        return formatToolOutput({
          status: "failed",
          classification: cls,
          workdir: cwd,
          gitRoot,
          stderr: err instanceof Error ? err.message : String(err),
        } satisfies CheckpointResult);
      }
    },
  },
};
