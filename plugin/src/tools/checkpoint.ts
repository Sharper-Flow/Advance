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
 * - Commit message: `chore(adv): checkpoint tk-xxxx` for complete,
 *   `chore(adv): cancel checkpoint tk-xxxx` for cancel.
 * - Idempotent on clean trees: returns {status:'clean'} without committing.
 * - Persists touched_files and error_class bridge via store.tasks.update.
 */

import { execFileGitCb } from "../utils/git-binary";
import { access } from "fs/promises";
import { isAbsolute, resolve } from "path";
import { z } from "zod";
import { formatToolOutput } from "../utils/tool-output";
import type { Store } from "../storage/store-types";
import type { Change, ErrorRecovery, ScopedSubagentReport } from "../types";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import {
  targetPathSchema,
  withTargetPathStore,
  appendTargetProjectContextOutput,
} from "./target-project";
import { loadChange } from "../storage/change-projection-reader";
import { extractStructuredOutput } from "../utils/extract-structured-output";
import { dismissAllSuggestedDrafts } from "../utils/wisdom-draft";

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const SUBJECT_MAX_LEN = 72;
const CHECKPOINT_TASK_ID_RE = /^tk-[A-Za-z0-9]+$/;

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
  recordingError?: string;
  remediation?: string;
  /** Repo-relative paths of files modified in this checkpoint */
  touched_files?: string[];
  /**
   * Wisdom drafts in the `suggested` state at checkpoint time
   * (rq-wisdomAutoSurfacing01 / AC5). Count BEFORE auto-dismissal.
   */
  drafts_pending_review?: number;
  /**
   * Wisdom drafts auto-dismissed at this checkpoint with
   * dismiss_reason "auto_checkpoint". Equals drafts_pending_review when
   * the dismissal signal fired successfully.
   */
  drafts_auto_dismissed?: number;
}

type ErrorClass = "SEMANTIC" | "ENVIRONMENTAL" | "TRANSIENT";

interface CheckpointRecordingResult {
  recorded: boolean;
  error?: string;
  remediation?: string;
  projectionFailureType?: string;
  /** Drafts in `suggested` state observed before auto-dismissal (AC5). */
  drafts_pending_review?: number;
  /** Drafts transitioned to `dismissed` at this checkpoint (AC5). */
  drafts_auto_dismissed?: number;
}

const CHECKPOINT_RECORDING_REMEDIATION =
  "Workflow task completion was not recorded. Retry adv_task_checkpoint before declaring the task done; if it persists, run adv_doctor and repair worker connectivity.";

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
    execFileGitCb(
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
 * - "detached" — detached HEAD with no recovery markers
 * - "merging" — MERGE_HEAD exists
 * - "rebasing" — REBASE_HEAD or rebase state directory exists
 * - "cherry-picking" — CHERRY_PICK_HEAD exists
 * - "reverting" — REVERT_HEAD exists
 * - "not_git" — not a git repo (or git unavailable)
 *
 * rq-twf01.3: recovery markers are probed BEFORE the detached-HEAD check.
 * Rebase and sequencer (cherry-pick/revert) operations run with a detached
 * HEAD by design, so classifying detached first would mask the active
 * recovery state and silently drop the trunk write firewall's structural
 * recovery allowance.
 */
export async function detectRepoState(cwd: string): Promise<RepoState> {
  try {
    // Check if we're in a git repo
    await runGit(["rev-parse", "--git-dir"], cwd);
  } catch {
    return "not_git";
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

  try {
    // Check for detached HEAD (symbolic ref fails when detached)
    await runGit(["symbolic-ref", "-q", "HEAD"], cwd);
  } catch {
    return "detached";
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
 * Complete: `chore(adv): checkpoint tk-xxxx` (subject ≤ 72)
 * Cancel:   `chore(adv): cancel checkpoint tk-xxxx` (subject ≤ 72)
 */
export function buildCommitMessage(
  taskId: string,
  mode: "complete" | "cancel",
  reason?: string,
  changeId?: string,
  verification?: string,
): { subject: string; body: string } {
  if (!CHECKPOINT_TASK_ID_RE.test(taskId)) {
    throw new Error(
      `Invalid checkpoint task ID "${taskId}". Expected tk-[A-Za-z0-9]+.`,
    );
  }

  const subject =
    mode === "cancel"
      ? `chore(adv): cancel checkpoint ${taskId}`
      : `chore(adv): checkpoint ${taskId}`;

  if (subject.length > SUBJECT_MAX_LEN) {
    throw new Error(
      `Checkpoint commit subject exceeds ${SUBJECT_MAX_LEN} characters for task ${taskId}.`,
    );
  }

  const lines: string[] = [];
  if (changeId) lines.push(`Change: ${changeId}`);
  lines.push(`Task: ${taskId}`);
  lines.push(`Mode: ${mode}`);
  if (mode === "cancel" && reason) lines.push(`Reason: ${reason}`);
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

async function taskHasPersistedSubagentReports(
  store: Store,
  taskId: string,
): Promise<boolean> {
  try {
    const result = await store.tasks.show(taskId);
    if ((result?.task.subagent_reports?.length ?? 0) > 0) return true;
    const changeId = result?.changeId;
    if (!changeId) return false;
    const changeResult = await store.changes.get(changeId);
    const change = changeResult.success ? changeResult.data : null;
    return (change?.subagent_reports ?? []).some((report) =>
      subagentReportBelongsToTask(report, taskId),
    );
  } catch {
    return false;
  }
}

function subagentReportBelongsToTask(
  report: ScopedSubagentReport,
  taskId: string,
): boolean {
  if (typeof report.scope !== "string" && report.scope.kind === "task") {
    return report.scope.task_id === taskId;
  }
  return "task_id" in report && report.task_id === taskId;
}

async function fireTaskCompletedFromCheckpoint(
  store: Store,
  taskId: string,
  sha: string,
  verification: string,
  touchedFiles: string[],
): Promise<CheckpointRecordingResult> {
  try {
    const changeId = await resolveChangeId(store, taskId);
    if (!changeId) {
      return {
        recorded: false,
        error: `Task not found: ${taskId}`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }
    const structuredOutput = (await taskHasPersistedSubagentReports(
      store,
      taskId,
    ))
      ? null
      : extractStructuredOutput(verification);

    const completedAt = new Date().toISOString();
    const outcome = await coordinateChangeMutation<Change>({
      authority: {
        reason: "record task checkpoint completion",
        evidence: `${sha}:${verification}`,
      },
      changesDir: store.paths.changes,
      intent: {
        changeId,
        mutationKind: "task_checkpoint_completed",
        mutateLatestProjection: (latest) => ({
          ...latest,
          tasks: latest.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status: "done" as const,
                  verification,
                  summary: verification,
                  completed_at: completedAt,
                  completedAt,
                  checkpointSha: sha,
                  filesTouched: touchedFiles,
                  ...(structuredOutput && {
                    structured_output: structuredOutput,
                  }),
                }
              : task,
          ),
        }),
        verifyProjection: (readback) => {
          const task = readback.tasks.find(
            (candidate) => candidate.id === taskId,
          );
          return (
            task?.status === "done" &&
            task.verification === verification &&
            task.checkpointSha === sha &&
            JSON.stringify(task.filesTouched ?? []) ===
              JSON.stringify(touchedFiles)
          );
        },
      },
    });
    if (outcome.kind !== "verified") {
      return {
        recorded: false,
        error:
          outcome.kind === "unverified" || outcome.kind === "operator_required"
            ? outcome.reason
            : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }
    const projectedResult = await loadChange(store.paths.changes, changeId);
    if (!projectedResult.success) {
      return {
        recorded: false,
        error: projectedResult.error,
        projectionFailureType: projectedResult.type,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }
    const projectedState = projectedResult.data;
    const recordedTask =
      projectedState?.tasks?.find((task) => task.id === taskId) ?? null;

    if (!recordedTask) {
      return {
        recorded: false,
        error: `Task ${taskId} was not readable after checkpoint completion`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }

    // rq-wisdomAutoSurfacing01 / D5 / AC5: now that the checkpoint
    // completion is durable, scan the readback task's wisdom_drafts[] for
    // `suggested` drafts and fire taskUpdatedSignal to atomically mark them
    // dismissed with dismiss_reason "auto_checkpoint". Idempotent per DDC4 —
    // checkpoint retries do not re-dismiss already-dismissed drafts. Draft
    // dismissal is best-effort: signal failure does not roll back the
    // completion or block the checkpoint.
    //
    // TOCTOU (correctness-6): concurrent from_draft_id promotion between
    // readback and this dismiss signal can be clobbered by the
    // Object.assign in applyTaskUpdatedToState replacing the entire
    // wisdom_drafts field with our snapshot. Single-agent session model
    // makes this theoretical; CAS-style fix deferred to fast-follow.
    let draftsPendingReview = 0;
    let draftsAutoDismissed = 0;
    try {
      const result = dismissAllSuggestedDrafts(
        recordedTask.wisdom_drafts,
        "auto_checkpoint",
        new Date().toISOString(),
      );
      draftsPendingReview = result.pendingReviewCount;
      if (result.dismissedCount > 0) {
        const dismissal = await coordinateChangeMutation<Change>({
          authority: {
            reason: "dismiss checkpoint-reviewed wisdom drafts",
            evidence: taskId,
          },
          changesDir: store.paths.changes,
          intent: {
            changeId,
            mutationKind: "checkpoint_draft_dismissal",
            mutateLatestProjection: (latest) => ({
              ...latest,
              tasks: latest.tasks.map((task) =>
                task.id === taskId
                  ? { ...task, wisdom_drafts: result.drafts }
                  : task,
              ),
            }),
            verifyProjection: (readback) =>
              JSON.stringify(
                readback.tasks.find((task) => task.id === taskId)
                  ?.wisdom_drafts ?? [],
              ) === JSON.stringify(result.drafts),
          },
        });
        if (dismissal.kind === "verified")
          draftsAutoDismissed = result.dismissedCount;
      }
    } catch {
      // Draft auto-dismiss is best-effort; counts remain 0 on failure.
    }

    if (recordedTask.status !== "done") {
      // rq-TDD009seq: surface specific rejection reason if available
      const rejections = projectedState?.signal_rejections ?? [];
      const latest = rejections[rejections.length - 1];
      const specificError =
        latest?.signalName === "taskCompleted" && latest.errorMessage
          ? latest.errorMessage
          : undefined;

      return {
        recorded: false,
        error:
          specificError ??
          `Task ${taskId} status is ${recordedTask.status ?? "unknown"} after checkpoint completion`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }

    if (recordedTask.verification !== verification) {
      return {
        recorded: false,
        error: `Task ${taskId} verification did not match checkpoint verification`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
      };
    }

    if (recordedTask.checkpointSha !== sha) {
      return {
        recorded: false,
        error: `Task ${taskId} checkpointSha did not match ${sha}`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
        drafts_pending_review: draftsPendingReview,
        drafts_auto_dismissed: draftsAutoDismissed,
      };
    }

    const recordedFiles = recordedTask.filesTouched ?? [];
    const touchedSet = new Set(touchedFiles);
    const filesMatch =
      recordedFiles.length === touchedFiles.length &&
      recordedFiles.every((file) => touchedSet.has(file));
    if (!filesMatch) {
      return {
        recorded: false,
        error: `Task ${taskId} filesTouched did not match checkpoint files`,
        remediation: CHECKPOINT_RECORDING_REMEDIATION,
        drafts_pending_review: draftsPendingReview,
        drafts_auto_dismissed: draftsAutoDismissed,
      };
    }

    return {
      recorded: true,
      drafts_pending_review: draftsPendingReview,
      drafts_auto_dismissed: draftsAutoDismissed,
    };
  } catch (err) {
    if (ADV_DEBUG) {
      console.warn("[checkpoint] task checkpoint mutation failed:", err);
    }
    return {
      recorded: false,
      error: err instanceof Error ? err.message : String(err),
      remediation: CHECKPOINT_RECORDING_REMEDIATION,
    };
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
      ...targetPathSchema.shape,
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
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
      defaultWorkdir: string,
    ): Promise<string> => {
      const runCheckpoint = async (
        activeStore: Store,
        activeDefaultWorkdir: string,
      ): Promise<string> => {
        const store = activeStore;

        // An explicitly blank workdir is a caller error — reject rather than
        // silently falling back to the default workdir.
        if (args.workdir !== undefined && args.workdir.trim() === "") {
          return formatToolOutput({
            status: "failed",
            classification: "SEMANTIC",
            workdir: args.workdir,
            error:
              "Explicit workdir must not be blank. Omit workdir to use the default working directory.",
          } satisfies CheckpointResult);
        }

        // rq-archiveTargetPathRouting01.1: target_path selects the target
        // Store state; it never overrides an explicit Git workdir.
        const cwd = args.workdir ?? activeDefaultWorkdir;

        // When target_path and an explicit workdir coexist, the workdir must
        // belong to the same repository as the target root (linked worktrees
        // share the git common dir). Compare common dirs BEFORE resolving
        // target task state, signaling, or committing; reject unrelated repos.
        if (args.target_path && args.workdir !== undefined) {
          let targetCommonDir = "";
          let workdirCommonDir = "";
          try {
            targetCommonDir = (
              await runGit(
                ["rev-parse", "--path-format=absolute", "--git-common-dir"],
                activeDefaultWorkdir,
              )
            ).stdout.trim();
            workdirCommonDir = (
              await runGit(
                ["rev-parse", "--path-format=absolute", "--git-common-dir"],
                cwd,
              )
            ).stdout.trim();
          } catch {
            // Probe failure — fail closed as an unrelated-repository reject.
          }
          if (
            !targetCommonDir ||
            !workdirCommonDir ||
            targetCommonDir !== workdirCommonDir
          ) {
            return formatToolOutput({
              status: "failed",
              classification: "SEMANTIC",
              workdir: cwd,
              error:
                `workdir ${cwd} is not part of the target repository ${activeDefaultWorkdir} ` +
                `(git common-dir mismatch). Run the checkpoint from a worktree linked to the ` +
                `target repository, or omit workdir to use the target root.`,
            } satisfies CheckpointResult);
          }
        }

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
          // Compute touchedFiles from the last commit diff so the
          // completion signal carries the real file set.
          let cleanTouchedFiles: string[];
          try {
            const { stdout: cleanDiffOutput } = await runGit(
              ["diff", "--name-only", "HEAD~1"],
              cwd,
            );
            cleanTouchedFiles = cleanDiffOutput
              .split("\n")
              .map((f) => f.trim())
              .filter((f) => f.length > 0);
          } catch {
            cleanTouchedFiles = [];
          }
          // For complete mode, fire taskCompletedSignal so the task is marked done
          let checkpointRecording: CheckpointRecordingResult = {
            recorded: mode !== "complete",
          };
          if (mode === "complete") {
            checkpointRecording = await fireTaskCompletedFromCheckpoint(
              store,
              args.taskId,
              actualHeadSha,
              args.verification ?? "Clean tree checkpoint",
              cleanTouchedFiles,
            );
          }
          return formatToolOutput({
            status: "clean",
            sha: actualHeadSha,
            branch: actualBranch,
            workdir: cwd,
            gitRoot,
            changeId: derivedChangeId,
            checkpointRecorded: checkpointRecording.recorded,
            ...(checkpointRecording.error && {
              recordingError: checkpointRecording.error,
            }),
            ...(checkpointRecording.remediation && {
              remediation: checkpointRecording.remediation,
            }),
            ...(checkpointRecording.drafts_pending_review !== undefined && {
              drafts_pending_review: checkpointRecording.drafts_pending_review,
            }),
            ...(checkpointRecording.drafts_auto_dismissed !== undefined && {
              drafts_auto_dismissed: checkpointRecording.drafts_auto_dismissed,
            }),
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
        let commitMessage: { subject: string; body: string };
        try {
          commitMessage = buildCommitMessage(
            args.taskId,
            mode,
            args.reason,
            effectiveChangeId,
            args.verification,
          );
        } catch (err) {
          return formatToolOutput({
            status: "failed",
            classification: "SEMANTIC",
            workdir: cwd,
            gitRoot,
            error: err instanceof Error ? err.message : String(err),
          } satisfies CheckpointResult);
        }

        const { subject, body } = commitMessage;

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
          let checkpointRecording: CheckpointRecordingResult = {
            recorded: mode !== "complete",
          };
          if (mode === "complete") {
            checkpointRecording = await fireTaskCompletedFromCheckpoint(
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
            checkpointRecorded: checkpointRecording.recorded,
            ...(checkpointRecording.error && {
              recordingError: checkpointRecording.error,
            }),
            ...(checkpointRecording.remediation && {
              remediation: checkpointRecording.remediation,
            }),
            touched_files: touchedFiles,
            ...(checkpointRecording.drafts_pending_review !== undefined && {
              drafts_pending_review: checkpointRecording.drafts_pending_review,
            }),
            ...(checkpointRecording.drafts_auto_dismissed !== undefined && {
              drafts_auto_dismissed: checkpointRecording.drafts_auto_dismissed,
            }),
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
      };

      // rq-archiveTargetPathRouting01: route task checkpoint through the
      // target project's store and root when target_path is approved.
      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "authoritative",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) => {
            const result = await runCheckpoint(
              targetStore,
              targetStore.paths.root,
            );
            return appendTargetProjectContextOutput(result, context);
          },
        );
      }

      return runCheckpoint(store, defaultWorkdir);
    },
  },
};
