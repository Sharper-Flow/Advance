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
 * - No store mutations — this is a read-only git operation.
 */

import { execFile } from "child_process";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const SUBJECT_MAX_LEN = 72;
const CANCEL_REASON_MAX_LEN = 64;

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
}

type ErrorClass = "SEMANTIC" | "ENVIRONMENTAL" | "TRANSIENT";

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

/**
 * Detect the state of the git repo. Returns:
 * - "ok" — normal repo on a branch
 * - "detached" — detached HEAD
 * - "merging" — MERGE_HEAD exists
 * - "not_git" — not a git repo (or git unavailable)
 */
export async function detectRepoState(
  cwd: string,
): Promise<"ok" | "detached" | "merging" | "not_git"> {
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
 * Build commit message with truncation.
 * Complete: `task(tk-xxxx): completed` (subject ≤ 72)
 * Cancel:   `task(tk-xxxx): cancel — <reason>` (reason ≤ 64)
 */
export function buildCommitMessage(
  taskId: string,
  mode: "complete" | "cancel",
  reason?: string,
): string {
  if (mode === "cancel") {
    // Truncate reason to fit within overall subject limit
    const prefix = `task(${taskId}): cancel \u2014 `;
    const maxReason = Math.min(
      CANCEL_REASON_MAX_LEN,
      SUBJECT_MAX_LEN - prefix.length,
    );
    const truncatedReason = (reason ?? "").slice(0, Math.max(0, maxReason));
    return `${prefix}${truncatedReason}`;
  }

  const msg = `task(${taskId}): completed`;
  return msg.slice(0, SUBJECT_MAX_LEN);
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
    },
    execute: async (
      args: {
        taskId: string;
        workdir?: string;
        mode?: "complete" | "cancel";
        reason?: string;
      },
      _store: Store,
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

      // Check if working tree is clean
      try {
        const { stdout: statusOutput } = await runGit(
          ["status", "--porcelain"],
          cwd,
        );
        if (statusOutput.trim() === "") {
          // Clean tree — idempotent, no commit needed
          const { stdout: sha } = await runGit(["rev-parse", "HEAD"], cwd);
          const { stdout: branch } = await runGit(
            ["rev-parse", "--abbrev-ref", "HEAD"],
            cwd,
          );
          return formatToolOutput({
            status: "clean",
            sha: sha.trim(),
            branch: branch.trim(),
            workdir: cwd,
          } satisfies CheckpointResult);
        }
      } catch (err) {
        return formatToolOutput({
          status: "failed",
          classification: classifyGitError(err),
          workdir: cwd,
          stderr: err instanceof Error ? err.message : String(err),
        } satisfies CheckpointResult);
      }

      // Dirty tree — stage all changes and commit
      const commitMsg = buildCommitMessage(args.taskId, mode, args.reason);

      try {
        // Stage
        await runGit(["add", "-A"], cwd);

        // Commit with retry for transient lock contention
        const maxRetries = 2;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            await runGit(["commit", "-m", commitMsg], cwd);
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
            return formatToolOutput({
              status: "failed",
              classification: cls === "TRANSIENT" ? "SEMANTIC" : cls,
              workdir: cwd,
              message: commitMsg,
              stderr: gitErr.stderr ?? gitErr.message,
              gitExitCode: gitErr.exitCode,
            } satisfies CheckpointResult);
          }
        }

        // Commit succeeded — return result
        const { stdout: sha } = await runGit(["rev-parse", "HEAD"], cwd);
        const { stdout: branch } = await runGit(
          ["rev-parse", "--abbrev-ref", "HEAD"],
          cwd,
        );
        return formatToolOutput({
          status: "committed",
          sha: sha.trim(),
          branch: branch.trim(),
          workdir: cwd,
          message: commitMsg,
        } satisfies CheckpointResult);
      } catch (err) {
        return formatToolOutput({
          status: "failed",
          classification: classifyGitError(err),
          workdir: cwd,
          stderr: err instanceof Error ? err.message : String(err),
        } satisfies CheckpointResult);
      }
    },
  },
};
