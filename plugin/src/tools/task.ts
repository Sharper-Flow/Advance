/**
 * Task Tools — Signal/Query Adapter Surface
 *
 * Tool-layer code fires signals and runs queries against change workflows,
 * replacing the old store.executeUpdate-based mutation path.
 * rq-crossProjectTaskMutation01: target_path task mutations must route all
 * validation, signals, cache refresh, and snapshots through target store.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import type { Store } from "../storage/store";
import {
  ErrorRecoverySchema,
  TaskContractRefsSchema,
  type ErrorRecovery,
  type TaskContractRefs,
  type TddReclassification,
  type Task,
} from "../types";
import { formatToolOutput, paginate } from "../utils/tool-output";
import { fetchChangeContextTicker } from "../storage/context-snapshot-fetch";
import {
  buildTodoProjection,
  formatTaskReadyOutput,
  formatDoomLoopDiagnostics,
} from "../utils/tool-formatters";
import {
  formatTargetProjectContext,
  resolveTargetAwareMutationCwd,
  targetPathSchema,
  type TargetProjectOutputContext,
  withOptionalTargetPathStore,
  withTargetPathStore,
} from "./target-project";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import {
  fireSignalAndRefresh,
  querySignal,
  getChangeHandle,
} from "./_adapters";
import { extractStructuredOutput } from "../utils/extract-structured-output";
import {
  taskAddedSignal,
  taskUpdatedSignal,
  taskAssignedSignal,
  taskBlockedSignal,
  taskCompletedSignal,
  taskCancelledSignal,
  changeTasksQuery,
  changeTaskQuery,
  changeReadyQuery,
} from "../temporal/messages";
import {
  checkWorktreeIsolation,
  type WorktreeIsolationDeps,
  type WorktreeIsolationResult,
} from "./worktree-isolation-guard";
import {
  ensureWorktreeForMutation,
  buildWorktreeAutoManageDeps,
  type EnsureWorktreeForMutationDeps,
} from "./worktree-auto-manage";
import type { Change } from "../types";
import {
  RECOVERY_RECONCILIATION_WARNING,
  isPrecisePoisonedHistoryEvidence,
} from "../temporal/recovery-classification";
import { workflowHasPoisonedDescription } from "./recovery-probe";
import {
  saveRecoveredTaskAdd,
  saveRecoveredTaskMutation,
} from "./_recovery-writers";

/**
 * rq-extend-poisoned-recovery: validate that callers using
 * `recoveryMode: poisoned_history` provide non-empty, precise evidence.
 * Returns an error message or undefined if validation passes.
 */
function validateTaskRecoveryArgs(args: {
  recoveryMode?: "normal" | "poisoned_history";
  recoveryEvidence?: string;
}): string | undefined {
  if (args.recoveryMode !== "poisoned_history") return undefined;
  if (!args.recoveryEvidence || !args.recoveryEvidence.trim()) {
    return "poisoned_history recovery requires non-empty recoveryEvidence";
  }
  if (!isPrecisePoisonedHistoryEvidence(args.recoveryEvidence)) {
    return "poisoned_history recoveryEvidence must cite precise poisoned-history evidence (TMPRL1100 / Nondeterminism / NonDeterministic / WorkflowExecutionUpdateAccepted / No command scheduled)";
  }
  return undefined;
}

const RecoveryModeSchema = z
  .enum(["normal", "poisoned_history"])
  .optional()
  .describe(
    "Optional recovery mode for poisoned-history workflows. Default 'normal'. 'poisoned_history' authorizes a disk-projection fallback when the workflow signal fails AND workflow describe reports poisoned evidence; requires recoveryEvidence.",
  );

const RecoveryEvidenceSchema = z
  .string()
  .optional()
  .describe(
    "Required when recoveryMode='poisoned_history'. Must cite precise poisoned-history evidence (e.g. cause=WorkflowTaskFailedCauseNonDeterministicError or TMPRL1100).",
  );

// =============================================================================
// Helpers
// =============================================================================

function makeTaskId(): string {
  return `tk-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function validateContractRefsAgainstContract(
  change: Change | undefined,
  refs: TaskContractRefs | undefined,
): string | undefined {
  if (!change?.contract || !refs) return undefined;
  const validIds = new Set(change.contract.items.map((item) => item.id));
  const referenced = [
    ...(refs.implements ?? []),
    ...(refs.verifies ?? []),
    ...(refs.respects ?? []),
  ];
  const unknown = referenced.filter((id) => !validIds.has(id));
  if (unknown.length === 0) return undefined;
  return `Task contract_refs reference unknown contract item${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`;
}

/**
 * Task-add worktree-isolation guard (rq-autoManageAdvWorktrees AC5).
 *
 * Synchronous when `change` is omitted (legacy callers) — preserves the
 * pre-Block-B contract. Async overload accepts `change` for per-change-
 * marker conditioning and routes through `ensureWorktreeForMutation`
 * (Block B helper). Both signatures share the WorktreeIsolationResult
 * return shape.
 */
export function evaluateTaskAddWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): WorktreeIsolationResult;
export function evaluateTaskAddWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  change: Change | undefined;
  /** rq-autoManageAdvWorktrees AC4 D1 — target_path → "target", scope_repos → "scope". */
  role?: "current" | "target" | "scope";
  /** Required when role === "scope" (D2). */
  repoId?: string;
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): Promise<WorktreeIsolationResult>;
export function evaluateTaskAddWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  change?: Change;
  role?: "current" | "target" | "scope";
  repoId?: string;
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): WorktreeIsolationResult | Promise<WorktreeIsolationResult> {
  // Sync path: caller omitted both `change` and `autoManageDeps` —
  // preserve the legacy synchronous contract for crosscut tests that
  // assert sync behavior. This branch can never land on auto_manage
  // because the activation helper reads the marker off `change`.
  if (input.change === undefined && input.autoManageDeps === undefined) {
    const flag = readBooleanFeatureFlagLocal(
      input.features,
      "worktree_guard_enforce",
      true,
    );
    if (!flag) return { decision: "ALLOW" };
    return checkWorktreeIsolation(input.cwd, {
      getSessionContext: input.getSessionContext,
    });
  }
  return ensureWorktreeForMutation({
    change: input.change,
    cwd: input.cwd,
    role: input.role,
    repoId: input.repoId,
    features: input.features,
    deps: {
      ...input.autoManageDeps,
      getSessionContext:
        input.autoManageDeps?.getSessionContext ?? input.getSessionContext,
    },
  });
}

type TaskUpdateStatus =
  | "pending"
  | "in_progress"
  | "blocked"
  | "done"
  | "cancelled";

const WORKTREE_GUARDED_TASK_UPDATE_STATUSES = new Set<TaskUpdateStatus>([
  "in_progress",
  "done",
  "cancelled",
]);

/**
 * Task-update worktree-isolation guard (rq-autoManageAdvWorktrees AC5).
 *
 * Mirrors `evaluateTaskAddWorktreeIsolation` overload pattern with the
 * additional non-mutating-status short-circuit. Non-guarded statuses
 * (e.g., `pending`, `blocked`) ALLOW even in auto-manage mode because
 * they don't represent execution-side mutations.
 */
export function evaluateTaskUpdateWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  status: TaskUpdateStatus;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): WorktreeIsolationResult;
export function evaluateTaskUpdateWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  status: TaskUpdateStatus;
  change: Change | undefined;
  /** rq-autoManageAdvWorktrees AC4 D1 — target_path → "target", scope_repos → "scope". */
  role?: "current" | "target" | "scope";
  /** Required when role === "scope" (D2). */
  repoId?: string;
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): Promise<WorktreeIsolationResult>;
export function evaluateTaskUpdateWorktreeIsolation(input: {
  features: unknown;
  cwd: string;
  status: TaskUpdateStatus;
  change?: Change;
  role?: "current" | "target" | "scope";
  repoId?: string;
  autoManageDeps?: EnsureWorktreeForMutationDeps;
  getSessionContext?: WorktreeIsolationDeps["getSessionContext"];
}): WorktreeIsolationResult | Promise<WorktreeIsolationResult> {
  if (!WORKTREE_GUARDED_TASK_UPDATE_STATUSES.has(input.status)) {
    return { decision: "ALLOW" };
  }
  if (input.change === undefined && input.autoManageDeps === undefined) {
    const flag = readBooleanFeatureFlagLocal(
      input.features,
      "worktree_guard_enforce",
      true,
    );
    if (!flag) return { decision: "ALLOW" };
    return checkWorktreeIsolation(input.cwd, {
      getSessionContext: input.getSessionContext,
    });
  }
  return ensureWorktreeForMutation({
    change: input.change,
    cwd: input.cwd,
    role: input.role,
    repoId: input.repoId,
    features: input.features,
    deps: {
      ...input.autoManageDeps,
      getSessionContext:
        input.autoManageDeps?.getSessionContext ?? input.getSessionContext,
    },
  });
}

function readBooleanFeatureFlagLocal(
  features: unknown,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!features || typeof features !== "object") return defaultValue;
  const value = (features as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : defaultValue;
}

async function resolveChangeId(
  store: Store,
  taskId: string,
): Promise<string | null> {
  try {
    const result = await store.tasks.show(taskId);
    if (result?.changeId) return result.changeId;
  } catch {
    // A stale reverse index can point store.tasks.show at an unavailable or
    // wrong workflow. Fall through to the read-only structural scan below so a
    // live active workflow can still own the task without requiring projection
    // refresh first.
  }

  // rq-reentryTaskLookup01: after re-entry, change-id-scoped workflow
  // queries can see newly-added tasks before the reverse task→change index or
  // disk projection is populated. Keep task-id-only tools structural by
  // falling back to typed workflow task arrays for active/non-terminal changes.
  // This fallback is read-only; mutations still happen only in the caller's
  // normal signal path after the owning change is resolved.
  let changes: Awaited<ReturnType<Store["changes"]["list"]>>["changes"];
  try {
    changes = (await store.changes.list()).changes;
  } catch {
    return null;
  }

  for (const change of changes) {
    if (change.status === "archived" || change.status === "closed") continue;
    try {
      const handle = await getHandleForChangeId(store, change.id);
      const tasks = await querySignal<Task[]>(
        handle,
        changeTasksQuery,
        undefined,
        undefined,
      );
      if ((tasks ?? []).some((task) => task.id === taskId)) {
        return change.id;
      }
    } catch {
      // Candidate workflow unavailable/stale — skip it. If no active workflow
      // contains the task, callers preserve the existing deterministic
      // `Task not found` response.
    }
  }

  return null;
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

// =============================================================================
// Tool Definitions
// =============================================================================

export const taskTools = {
  adv_task_show: {
    description:
      "Get full details of a single task by ID, including its parent change ID. Use when you have a task ID but need the complete task object.",
    args: {
      taskId: z.string().describe("Task ID (e.g., 'tk-Hf7dK2mN')"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
    },
    execute: async (
      { taskId, target_path }: { taskId: string; target_path?: string },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const changeId = await resolveChangeId(activeStore, taskId);
          if (!changeId) {
            return formatToolOutput({ error: `Task not found: ${taskId}` });
          }
          const handle = await getHandleForChangeId(activeStore, changeId);
          const task = await querySignal<Task | null>(
            handle,
            changeTaskQuery,
            taskId,
          );
          if (!task) {
            return formatToolOutput({ error: `Task not found: ${taskId}` });
          }
          const output: Record<string, unknown> = {
            task,
            changeId,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };
          if (task.error_recovery) {
            output.formatted_doom_loop = formatDoomLoopDiagnostics(
              task.error_recovery,
            );
          }
          return formatToolOutput(output);
        },
      );
    },
  },

  adv_task_list: {
    description: "List tasks for a change with optional status filter",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Returns tasks ordered by priority with metadata, TDD state, and dependencies.",
        ),
      status: z
        .enum(["pending", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Filter by status"),
      // rq-advmeta01: Task Metadata Filter Semantics — supports
      // has_metadata_key:<key> and metadata:<key>=<value> against the
      // workflow-owned source-of-truth state.
      filter: z
        .string()
        .optional()
        .describe(
          'Metadata filter: "has_metadata_key:<key>" or "metadata:<key>=<value>"',
        ),
      limit: z
        .number()
        .optional()
        .describe("Max tasks to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Offset for pagination (default: 0)"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
    },
    execute: async (
      args: {
        changeId: string;
        status?: "pending" | "in_progress" | "done" | "cancelled";
        filter?: string;
        limit?: number;
        offset?: number;
        target_path?: string;
      },
      store: Store,
    ) => {
      const { changeId, status, filter, limit, offset, target_path } = args;
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const handle = await getHandleForChangeId(activeStore, changeId);
          const tasks = await querySignal<Task[]>(
            handle,
            changeTasksQuery,
            status,
            filter,
          );
          const paged = paginate(tasks, {
            limit,
            offset,
            tool: "adv_task_list",
            args: `changeId: "${changeId}"${status ? `, status: "${status}"` : ""}${filter ? `, filter: "${filter}"` : ""}`,
          });
          return formatToolOutput({
            tasks: paged.items,
            pagination: paged.pagination,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        },
      );
    },
  },

  adv_task_ready: {
    description: "Get unblocked pending tasks ready for work",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID — must match an existing change from `adv_change_list`. Returns ready (unblocked) tasks plus the blocked list with their blockedBy references.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
    },
    execute: async (
      { changeId, target_path }: { changeId: string; target_path?: string },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const handle = await getHandleForChangeId(activeStore, changeId);
          const result = (await querySignal(handle, changeReadyQuery)) as {
            ready: Task[];
            blocked: Array<{ task: Task; blockedBy: string[] }>;
          };
          const snapshot = await fetchChangeContextTicker(
            activeStore,
            changeId,
          );
          const formatted = formatTaskReadyOutput({
            ready: result.ready.map((t) => ({
              id: t.id,
              content: t.title,
              status: t.status,
            })),
            blocked: result.blocked.map((b) => ({
              task: {
                id: b.task.id,
                content: b.task.title,
                status: b.task.status,
              },
              blockedBy: b.blockedBy,
            })),
          });
          const changeResult = await activeStore.changes.get(changeId);
          const currentTask = changeResult.success
            ? changeResult.data?.tasks.find(
                (task) => task.status === "in_progress",
              )
            : undefined;
          return formatToolOutput({
            ...result,
            _todoProjection: buildTodoProjection({
              current: currentTask ?? null,
              ready: result.ready.map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
              })),
            }),
            formatted,
            ...(snapshot ? { _contextSnapshot: snapshot } : {}),
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        },
      );
    },
  },

  adv_task_update: {
    description:
      "Update task status. NOTE: To cancel a task, use adv_task_cancel instead — direct cancellation via this tool is not allowed. To mark a task done, use adv_task_completed instead.",
    args: {
      taskId: z.string().describe("Task ID"),
      status: z
        .enum(["pending", "in_progress", "blocked", "done", "cancelled"])
        .describe("New status"),
      notes: z.string().optional().describe("Completion notes"),
      implementation_summary: z
        .string()
        .optional()
        .describe(
          "Structured summary of what was implemented and how — persisted at task completion for context continuity",
        ),
      error_recovery: ErrorRecoverySchema.optional().describe(
        "Structured retry history for doom-loop tracking, including attempts[]",
      ),
      contract_refs: TaskContractRefsSchema.optional().describe(
        "Structured links from this task to approved change-contract items. Use implements/verifies/respects arrays, or not_applicable_reason for code tasks that intentionally have no contract obligation.",
      ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
      recoveryMode: RecoveryModeSchema,
      recoveryEvidence: RecoveryEvidenceSchema,
    },
    execute: async (
      args: {
        taskId: string;
        status: "pending" | "in_progress" | "blocked" | "done" | "cancelled";
        notes?: string;
        implementation_summary?: string;
        error_recovery?: ErrorRecovery;
        contract_refs?: TaskContractRefs;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
      const recoveryError = validateTaskRecoveryArgs(args);
      if (recoveryError) {
        return formatToolOutput({ error: recoveryError });
      }
      const runUpdate = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const changeId = await resolveChangeId(activeStore, args.taskId);
        if (!changeId) {
          return formatToolOutput({ error: `Task not found: ${args.taskId}` });
        }

        // Load change for per-change-marker conditioning (AC5). Best-
        // effort: if the lookup fails we fall through to the legacy
        // block_only / off behavior by passing undefined.
        let changeForGuard: Change | undefined;
        try {
          const changeResult = await activeStore.changes.get(changeId);
          if (changeResult.success && changeResult.data) {
            changeForGuard = changeResult.data;
          }
        } catch {
          // Pass undefined → guard runs in legacy mode based on global flag.
        }
        const contractRefsError = validateContractRefsAgainstContract(
          changeForGuard,
          args.contract_refs,
        );
        if (contractRefsError) {
          return formatToolOutput({
            error: contractRefsError,
            changeId,
            taskId: args.taskId,
          });
        }
        // rq-autoManageAdvWorktrees AC4 D1 — target_path mutations route
        // through the target store; pass role="target" so auto-managed
        // worktree materialization uses the target project's worktree state.
        const isolation = await evaluateTaskUpdateWorktreeIsolation({
          features: activeStore.config?.features,
          cwd: resolveTargetAwareMutationCwd({
            store: activeStore,
            target_path: args.target_path,
          }),
          status: args.status,
          change: changeForGuard,
          role: args.target_path ? "target" : "current",
          autoManageDeps:
            changeForGuard?.worktree_auto_managed === true
              ? await buildWorktreeAutoManageDeps(activeStore)
              : undefined,
        });
        if (isolation.decision === "BLOCK") {
          return formatToolOutput({
            error: isolation.reason,
            errorClass: isolation.errorClass,
            code: isolation.code,
            changeId,
            taskId: args.taskId,
            mainCheckoutPath: isolation.mainCheckoutPath,
            expectedWorktreePath: isolation.expectedWorktreePath,
            underlying_error: isolation.underlying_error,
            remediation: isolation.remediation,
          });
        }

        if (args.status === "cancelled") {
          return formatToolOutput({
            error:
              "Direct task cancellation is not allowed. Use adv_task_cancel instead, which requires presenting cancellation reasons to the user and obtaining explicit approval.",
            hint: "Call adv_task_cancel with taskIds, reasons (per task), and user approval evidence.",
          });
        }

        const handle = await getHandleForChangeId(activeStore, changeId);
        const now = new Date().toISOString();
        let taskRecord: Awaited<ReturnType<Store["tasks"]["show"]>> | null =
          null;
        try {
          taskRecord = await activeStore.tasks.show(args.taskId);
        } catch {
          // The owning change was already resolved via structural live-state
          // scan. If the stale index still makes the task fast path throw, do
          // not block the normal signal mutation path.
        }
        const currentStatus = taskRecord?.task.status;
        const shouldPatchExistingDoneTask =
          Boolean(args.contract_refs) &&
          args.status === "done" &&
          currentStatus === "done";

        let recoveredViaPoisoned = false;
        try {
          if (args.status === "in_progress") {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              changeId,
              taskAssignedSignal,
              {
                taskId: args.taskId,
                sessionId: "agent",
                assignedAt: now,
              },
            );
          } else if (args.status === "blocked") {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              changeId,
              taskBlockedSignal,
              {
                taskId: args.taskId,
                reason: args.notes ?? "Task blocked",
                attempts: args.error_recovery?.attempts ?? [],
                blockedAt: now,
              },
            );
          } else if (args.status === "done" && !shouldPatchExistingDoneTask) {
            const combinedText = [args.implementation_summary, args.notes]
              .filter(Boolean)
              .join("\n");
            const structuredOutput = extractStructuredOutput(combinedText);
            await fireSignalAndRefresh(
              handle,
              activeStore,
              changeId,
              taskCompletedSignal,
              {
                taskId: args.taskId,
                verification:
                  args.notes ??
                  args.implementation_summary ??
                  "Task marked done via adv_task_update",
                summary:
                  args.implementation_summary ?? args.notes ?? "Task completed",
                filesTouched: [],
                completedAt: now,
                ...(structuredOutput && {
                  structured_output: structuredOutput,
                }),
              },
            );
          } else {
            await fireSignalAndRefresh(
              handle,
              activeStore,
              changeId,
              taskUpdatedSignal,
              {
                taskId: args.taskId,
                partial: {
                  status: args.status,
                  ...(args.notes && { notes: args.notes }),
                  ...(args.implementation_summary && {
                    implementation_summary: args.implementation_summary,
                  }),
                  ...(args.error_recovery && {
                    error_recovery: args.error_recovery,
                  }),
                  ...(args.contract_refs && {
                    contract_refs: args.contract_refs,
                  }),
                },
                updatedAt: now,
              },
            );
          }
        } catch (signalError) {
          // rq-extend-poisoned-recovery AC1: disk-projection fallback when
          // workflow is poisoned. Requires explicit recoveryMode + precise
          // evidence + describe-confirmed signature.
          if (
            args.recoveryMode === "poisoned_history" &&
            (await workflowHasPoisonedDescription(handle))
          ) {
            const changeResult = await activeStore.changes.get(changeId);
            if (!changeResult.success || !changeResult.data) {
              throw signalError;
            }
            const change = changeResult.data;
            await saveRecoveredTaskMutation({
              store: activeStore,
              change,
              taskId: args.taskId,
              mutate: (task) => {
                const patch: Partial<Task> = {
                  status: args.status,
                  ...(args.notes && { notes: args.notes }),
                  ...(args.implementation_summary && {
                    implementation_summary: args.implementation_summary,
                    summary: args.implementation_summary,
                  }),
                  ...(args.error_recovery && {
                    error_recovery: args.error_recovery,
                  }),
                  ...(args.contract_refs && {
                    contract_refs: args.contract_refs,
                  }),
                };
                if (args.status === "in_progress") {
                  patch.assignedTo = "agent";
                  patch.started_at = task.started_at ?? now;
                } else if (args.status === "done") {
                  patch.completed_at = now;
                  patch.completedAt = now;
                  patch.verification =
                    args.notes ??
                    args.implementation_summary ??
                    "Task marked done via adv_task_update (poisoned-history recovery)";
                }
                return { ...task, ...patch } as Task;
              },
            });
            recoveredViaPoisoned = true;
          } else {
            throw signalError;
          }
        }

        let task: Task | null = null;
        if (!recoveredViaPoisoned) {
          task = await querySignal<Task | null>(
            handle,
            changeTaskQuery,
            args.taskId,
          );
        } else {
          // After recovery write, read task from refreshed store.
          const refreshed = await activeStore.changes.get(changeId);
          if (refreshed.success && refreshed.data) {
            task =
              (refreshed.data.tasks.find(
                (t) => t.id === args.taskId,
              ) as Task) ?? null;
          }
        }

        const output: Record<string, unknown> = {
          success: true,
          task,
          ...(projectContext ? { _projectContext: projectContext } : {}),
          ...(recoveredViaPoisoned
            ? {
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              }
            : {}),
        };
        if (task?.error_recovery) {
          output.formatted_doom_loop = formatDoomLoopDiagnostics(
            task.error_recovery,
          );
        }
        if (
          changeId &&
          (args.status === "in_progress" || args.status === "done") &&
          !recoveredViaPoisoned
        ) {
          const snapshot = await fetchChangeContextTicker(
            activeStore,
            changeId,
          );
          if (snapshot) {
            output._contextSnapshot = snapshot;
          }
        }
        return formatToolOutput(output);
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runUpdate(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runUpdate(store);
    },
  },

  adv_task_add: {
    description: "Add a new task to a change",
    args: {
      changeId: z
        .string()
        .describe(
          "Change ID to add the task to. Must match an existing change from `adv_change_list` — fetch the list first if unsure. Tasks are rejected after the planning gate is complete.",
        ),
      content: z
        .string()
        .describe(
          "Task description. First line becomes the title; the rest is the body. Include affected files, RED/GREEN plan, and acceptance criteria inline for traceability.",
        ),
      metadata: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional task metadata (e.g., { tdd_intent: 'inline' })"),
      contract_refs: TaskContractRefsSchema.optional().describe(
        "Structured links from this task to approved change-contract items. Add implements/verifies/respects refs during prep for standard/strict contracts, or not_applicable_reason when appropriate.",
      ),
      blockedBy: z
        .array(z.string())
        .optional()
        .describe(
          "Task IDs that block this task. Each ID MUST exist in the same change — fetch current task IDs with `adv_task_list changeId: <id>` before calling. Unknown IDs are rejected with the list of valid IDs in the response.",
        ),
      section: z
        .string()
        .optional()
        .describe("Section header (e.g., 'Testing')"),
      recoveryMode: RecoveryModeSchema,
      recoveryEvidence: RecoveryEvidenceSchema,
      ...targetPathSchema.shape,
    },
    execute: async (
      args: {
        changeId: string;
        content: string;
        metadata?: Record<string, string>;
        contract_refs?: TaskContractRefs;
        blockedBy?: string[];
        section?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
      },
      store: Store,
    ) => {
      const recoveryError = validateTaskRecoveryArgs(args);
      if (recoveryError) {
        return formatToolOutput({ error: recoveryError });
      }
      const runAdd = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const {
          changeId,
          content,
          metadata,
          contract_refs,
          blockedBy,
          section,
        } = args;

        let changeForGuard: Change | undefined;
        try {
          const changeResult = await activeStore.changes.get(changeId);
          if (changeResult.success && changeResult.data) {
            changeForGuard = changeResult.data;
          }
        } catch {
          // Pass undefined → guard runs in legacy mode based on global flag.
        }
        const contractRefsError = validateContractRefsAgainstContract(
          changeForGuard,
          contract_refs,
        );
        if (contractRefsError) {
          return formatToolOutput({
            error: contractRefsError,
            changeId,
          });
        }
        // rq-autoManageAdvWorktrees AC4 D1 — target_path → role:"target".
        const isolation = await evaluateTaskAddWorktreeIsolation({
          features: activeStore.config?.features,
          cwd: resolveTargetAwareMutationCwd({
            store: activeStore,
            target_path: args.target_path,
          }),
          change: changeForGuard,
          role: args.target_path ? "target" : "current",
          autoManageDeps:
            changeForGuard?.worktree_auto_managed === true
              ? await buildWorktreeAutoManageDeps(activeStore)
              : undefined,
        });
        if (isolation.decision === "BLOCK") {
          return formatToolOutput({
            error: isolation.reason,
            errorClass: isolation.errorClass,
            code: isolation.code,
            changeId,
            mainCheckoutPath: isolation.mainCheckoutPath,
            expectedWorktreePath: isolation.expectedWorktreePath,
            underlying_error: isolation.underlying_error,
            remediation: isolation.remediation,
          });
        }

        // Planning-gate lock: reject task creation after planning gate is complete
        const gates = await activeStore.gates.get(changeId);
        if (gates && gates.planning.status === "done") {
          return formatToolOutput({
            error: `Cannot add tasks after planning gate is complete. Use adv_task_reclassify_tdd to modify existing task TDD intent, or use adv_change_reenter to reopen the planning gate for scope expansion.`,
          });
        }

        const handle = await getHandleForChangeId(activeStore, changeId);

        // P1.12 Scope C: validate blockedBy task IDs exist in this change
        if (blockedBy && blockedBy.length > 0) {
          const tasks = await querySignal<Task[]>(
            handle,
            changeTasksQuery,
            undefined,
            undefined,
          );
          const validIdSet = new Set(tasks.map((t) => t.id));
          const unknown = blockedBy.filter((id) => !validIdSet.has(id));
          if (unknown.length > 0) {
            return formatToolOutput({
              error:
                unknown.length === 1
                  ? `Unknown task ID in blockedBy: '${unknown[0]}' does not exist in change '${changeId}'.`
                  : `Unknown task IDs in blockedBy: ${unknown.map((id) => `'${id}'`).join(", ")} do not exist in change '${changeId}'.`,
              hint: `Fetch the current task IDs with 'adv_task_list changeId: ${changeId}' and copy exact IDs into blockedBy.`,
              unknownTaskIds: unknown,
              validTaskIds: Array.from(validIdSet),
            });
          }
        }

        // Query current tasks to compute next priority
        const tasks = await querySignal<Task[]>(
          handle,
          changeTasksQuery,
          undefined,
          undefined,
        );
        const nextPriority =
          tasks.length === 0
            ? 0
            : Math.max(...tasks.map((t) => t.priority ?? 0)) + 1;

        const mergedMetadata = { ...metadata };
        if (!mergedMetadata.tdd_intent) {
          mergedMetadata.tdd_intent = "inline";
        }

        const now = new Date().toISOString();
        const task: Task = {
          id: makeTaskId(),
          title: content.split("\n")[0] || content,
          type: "code",
          section,
          status: "pending",
          priority: nextPriority,
          created_at: now,
          deps: blockedBy?.map((target) => ({
            type: "blocked_by" as const,
            target,
          })),
          ...(Object.keys(mergedMetadata).length > 0
            ? { metadata: mergedMetadata }
            : {}),
          ...(contract_refs ? { contract_refs } : {}),
        };

        let recoveredViaPoisoned = false;
        try {
          await fireSignalAndRefresh(
            handle,
            activeStore,
            changeId,
            taskAddedSignal,
            {
              task,
              addedAt: now,
            },
          );
        } catch (signalError) {
          // rq-extend-poisoned-recovery AC2: disk-projection fallback for add.
          if (
            args.recoveryMode === "poisoned_history" &&
            (await workflowHasPoisonedDescription(handle))
          ) {
            const changeResult = await activeStore.changes.get(changeId);
            if (!changeResult.success || !changeResult.data) {
              throw signalError;
            }
            await saveRecoveredTaskAdd({
              store: activeStore,
              change: changeResult.data,
              task,
            });
            recoveredViaPoisoned = true;
          } else {
            throw signalError;
          }
        }

        const snapshot = recoveredViaPoisoned
          ? null
          : await fetchChangeContextTicker(activeStore, changeId);
        return formatToolOutput({
          taskId: task.id,
          task,
          ...(projectContext ? { _projectContext: projectContext } : {}),
          ...(snapshot ? { _contextSnapshot: snapshot } : {}),
          ...(recoveredViaPoisoned
            ? {
                _recoveryMutation: true,
                reconciliationWarning: RECOVERY_RECONCILIATION_WARNING,
              }
            : {}),
        });
      };

      try {
        if (args.target_path) {
          return withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              stateRequirement: "temporal-required",
              target_confirmed: args.target_confirmed,
              confirmationEvidence: args.confirmationEvidence,
            },
            async ({ context, store: targetStore }) =>
              runAdd(targetStore, formatTargetProjectContext(context)),
          );
        }

        return runAdd(store);
      } catch (error) {
        return formatToolOutput({
          error: error instanceof Error ? error.message : "Failed to add task",
        });
      }
    },
  },

  adv_task_completed: {
    description:
      "Mark a task as completed by firing taskCompletedSignal. Requires verification and summary. Use after the Green Phase and checkpoint.",
    args: {
      taskId: z.string().describe("Task ID to mark as completed"),
      verification: z
        .string()
        .min(1)
        .describe("Verification summary (e.g., test command that passed)"),
      summary: z
        .string()
        .min(1)
        .describe("Concise summary of what was implemented"),
      filesTouched: z
        .array(z.string())
        .optional()
        .describe("Repo-relative paths of files modified by this task"),
      checkpointSha: z
        .string()
        .optional()
        .describe("Git checkpoint SHA from adv_task_checkpoint"),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z.literal(true).optional(),
      confirmationEvidence: z.string().optional(),
    },
    execute: async (
      args: {
        taskId: string;
        verification: string;
        summary: string;
        filesTouched?: string[];
        checkpointSha?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runComplete = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const changeId = await resolveChangeId(activeStore, args.taskId);
        if (!changeId) {
          return formatToolOutput({ error: `Task not found: ${args.taskId}` });
        }

        const handle = await getHandleForChangeId(activeStore, changeId);
        const now = new Date().toISOString();

        const combinedText = `${args.verification}\n${args.summary}`;
        const structuredOutput = extractStructuredOutput(combinedText);
        await fireSignalAndRefresh(
          handle,
          activeStore,
          changeId,
          taskCompletedSignal,
          {
            taskId: args.taskId,
            verification: args.verification,
            summary: args.summary,
            filesTouched: args.filesTouched ?? [],
            checkpointSha: args.checkpointSha,
            completedAt: now,
            ...(structuredOutput && { structured_output: structuredOutput }),
          },
        );

        const output: Record<string, unknown> = {
          success: true,
          taskId: args.taskId,
          verification: args.verification,
          summary: args.summary,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        };

        const snapshot = await fetchChangeContextTicker(activeStore, changeId);
        if (snapshot) {
          output._contextSnapshot = snapshot;
        }

        return formatToolOutput(output);
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runComplete(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runComplete(store);
    },
  },

  adv_task_cancel: {
    description:
      "Cancel one or more tasks with required user approval. " +
      "Before calling this tool, the agent MUST present all proposed cancellations " +
      "to the user (each with a per-task reason) via the question tool, and obtain " +
      "explicit approval. Batch approval is allowed.",
    args: {
      taskIds: z
        .array(z.string())
        .describe(
          "Task IDs to cancel (batch supported). All IDs must exist in the same change — fetch with `adv_task_list` first. Cancellations are atomic: if any ID is unknown, NO task is cancelled.",
        ),
      reasons: z
        .record(z.string(), z.string())
        .describe(
          "Per-task cancellation reasons keyed by task ID (e.g., { 'tk-abc': 'Absorbed into tk-xyz' }). Every task ID in `taskIds` MUST have an entry here — missing reasons are rejected.",
        ),
      approvedByUser: z
        .literal(true)
        .describe(
          "MUST be literal `true` — confirms the user explicitly approved this cancellation via the `question` tool. Never call this tool without first presenting the cancellations to the user.",
        ),
      approvalEvidence: z
        .string()
        .describe(
          "Evidence of user approval — cite the question tool response verbatim (e.g., 'User approved via question tool: selected Approve cancellations'). Empty or whitespace-only strings are rejected.",
        ),
      supersededBy: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          "Optional per-task superseding task ID mapping (e.g., { 'tk-abc': 'tk-xyz' }). Populate only when a cancelled task is replaced by another task in the same change.",
        ),
      dryRun: z
        .boolean()
        .optional()
        .describe(
          "Preview cancellation without firing task cancellation signals.",
        ),
      recoveryMode: RecoveryModeSchema,
      recoveryEvidence: RecoveryEvidenceSchema,
      ...targetPathSchema.shape,
    },
    execute: async (
      args: {
        taskIds: string[];
        reasons: Record<string, string>;
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: Record<string, string>;
        dryRun?: boolean;
        recoveryMode?: "normal" | "poisoned_history";
        recoveryEvidence?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const recoveryError = validateTaskRecoveryArgs(args);
      if (recoveryError) {
        return formatToolOutput({ error: recoveryError });
      }
      const runCancel = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const {
          taskIds,
          approvedByUser,
          approvalEvidence,
          supersededBy: _supersededBy,
        } = args;
        const reasons = args.reasons ?? {};

        // Validate every task has a reason
        const missingReasons = taskIds.filter((id) => !reasons[id]);
        if (missingReasons.length > 0) {
          return formatToolOutput({
            error: `Missing cancellation reason for tasks: ${missingReasons.join(", ")}. Every task requires a per-task reason.`,
            missingReasons,
          });
        }

        if (!approvedByUser) {
          return formatToolOutput({
            error:
              "approvedByUser must be true. You must present cancellations to the user and obtain explicit approval before calling this tool.",
          });
        }

        if (!approvalEvidence || approvalEvidence.trim().length === 0) {
          return formatToolOutput({
            error:
              "approvalEvidence is required. Describe how the user approved (e.g., question tool response).",
          });
        }

        // P1.12 Scope C: pre-flight relational validation of task IDs.
        const unknownTaskIds: string[] = [];
        const existingTasks: Array<{ id: string; title: string }> = [];
        for (const taskId of taskIds) {
          const existing = await activeStore.tasks.show(taskId);
          if (!existing) {
            unknownTaskIds.push(taskId);
          } else {
            existingTasks.push({
              id: taskId,
              title: existing.task.title,
            });
          }
        }
        if (unknownTaskIds.length > 0) {
          return formatToolOutput({
            error:
              unknownTaskIds.length === 1
                ? `Task ID not found: '${unknownTaskIds[0]}'. No tasks were cancelled.`
                : `Task IDs not found: ${unknownTaskIds.map((id) => `'${id}'`).join(", ")}. No tasks were cancelled.`,
            hint: "Confirm each task ID with 'adv_task_list changeId: <id>' before retrying. Cancellations are atomic — all IDs must be valid or none are cancelled.",
            unknownTaskIds,
          });
        }

        if (args.dryRun) {
          return formatToolOutput({
            success: true,
            dryRun: true,
            wouldCancel: existingTasks,
            results: taskIds.map((taskId) => ({
              taskId,
              success: true,
              dryRun: true,
              reason: reasons[taskId],
            })),
            message: `Would cancel ${taskIds.length} task(s) with user approval.`,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }

        const results: Array<{
          taskId: string;
          success: boolean;
          error?: string;
        }> = [];
        const cancelledTasks: Array<{ id: string; title: string }> = [];
        const now = new Date().toISOString();

        for (const taskId of taskIds) {
          const changeId = await resolveChangeId(activeStore, taskId);
          if (!changeId) {
            results.push({
              taskId,
              success: false,
              error: `Task not found: ${taskId}`,
            });
            continue;
          }

          try {
            const handle = await getHandleForChangeId(activeStore, changeId);
            try {
              await fireSignalAndRefresh(
                handle,
                activeStore,
                changeId,
                taskCancelledSignal,
                {
                  taskId,
                  approvalEvidence,
                  reason: reasons[taskId],
                  cancelledAt: now,
                },
              );
            } catch (signalError) {
              // rq-extend-poisoned-recovery AC3: disk-projection fallback
              // for cancel when workflow is poisoned.
              if (
                args.recoveryMode === "poisoned_history" &&
                (await workflowHasPoisonedDescription(handle))
              ) {
                const changeResult = await activeStore.changes.get(changeId);
                if (!changeResult.success || !changeResult.data) {
                  throw signalError;
                }
                await saveRecoveredTaskMutation({
                  store: activeStore,
                  change: changeResult.data,
                  taskId,
                  mutate: (task) =>
                    ({
                      ...task,
                      status: "cancelled",
                      completed_at: now,
                      completedAt: now,
                      notes: reasons[taskId],
                    }) as Task,
                });
              } else {
                throw signalError;
              }
            }
            results.push({ taskId, success: true });
            cancelledTasks.push({ id: taskId, title: "(cancelled)" });
          } catch (err) {
            results.push({
              taskId,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const allSuccess = results.every((r) => r.success);

        const output: Record<string, unknown> = {
          success: allSuccess,
          cancelled: cancelledTasks,
          results,
          message: allSuccess
            ? `Cancelled ${cancelledTasks.length} task(s) with user approval.`
            : `Partial cancellation: ${results.filter((r) => r.success).length}/${taskIds.length} succeeded.`,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        };

        if (cancelledTasks.length > 0) {
          const firstTask = await activeStore.tasks.show(cancelledTasks[0].id);
          const changeId = firstTask?.changeId;
          if (changeId) {
            const snapshot = await fetchChangeContextTicker(
              activeStore,
              changeId,
            );
            if (snapshot) {
              output._contextSnapshot = snapshot;
            }
          }
        }

        return formatToolOutput(output);
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            mutation: args.dryRun ? false : undefined,
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runCancel(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runCancel(store);
    },
  },

  adv_task_reclassify_tdd: {
    description:
      "Set or reclassify a task's TDD intent (tdd_intent metadata) with required user approval. " +
      "Use to assign initial tdd_intent when missing, or change it after the prep gate is complete. " +
      "Records a full audit trail (from_intent, to_intent, reason, approval evidence). " +
      "from_intent is recorded as 'none' for initial assignment.",
    args: {
      taskId: z.string().describe("Task ID to reclassify"),
      toIntent: z
        .enum(["inline", "separate_verification", "not_applicable"])
        .describe("New TDD intent value"),
      reason: z.string().describe("Why the TDD intent is being changed"),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe(
          "Evidence of user approval (e.g., 'User approved via question tool')",
        ),
      ...targetPathSchema.shape,
    },
    execute: async (
      args: {
        taskId: string;
        toIntent: "inline" | "separate_verification" | "not_applicable";
        reason: string;
        approvedByUser: true;
        approvalEvidence: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runReclassify = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        if (!args.approvedByUser) {
          return formatToolOutput({
            error:
              "approvedByUser must be true. You must present the reclassification to the user and obtain explicit approval before calling this tool.",
          });
        }

        if (
          !args.approvalEvidence ||
          args.approvalEvidence.trim().length === 0
        ) {
          return formatToolOutput({
            error:
              "approvalEvidence is required. Describe how the user approved (e.g., question tool response).",
          });
        }

        const taskResult = await activeStore.tasks.show(args.taskId);
        if (!taskResult) {
          return formatToolOutput({
            error: `Task not found: ${args.taskId}`,
          });
        }

        const { task } = taskResult;

        if (task.status === "cancelled") {
          return formatToolOutput({
            error: `Task ${args.taskId} is cancelled. Cannot reclassify TDD intent on a cancelled task.`,
          });
        }

        const currentIntent = task.metadata?.tdd_intent;

        if (currentIntent === args.toIntent) {
          return formatToolOutput({
            error: `Task ${args.taskId} already has tdd_intent="${args.toIntent}". No reclassification needed.`,
          });
        }

        const changeId = taskResult.changeId;
        const handle = await getHandleForChangeId(activeStore, changeId);
        const now = new Date().toISOString();

        await fireSignalAndRefresh(
          handle,
          activeStore,
          changeId,
          taskUpdatedSignal,
          {
            taskId: args.taskId,
            partial: {
              metadata: {
                ...task.metadata,
                tdd_intent: args.toIntent,
              },
            },
            updatedAt: now,
          },
        );

        const reclassification: TddReclassification = {
          from_intent: currentIntent ?? "none",
          to_intent: args.toIntent,
          reason: args.reason,
          approved_by_user: true,
          approval_evidence: args.approvalEvidence,
          approved_at: now,
        };

        return formatToolOutput({
          success: true,
          taskId: args.taskId,
          reclassification,
          message: `Reclassified tdd_intent from "${currentIntent}" to "${args.toIntent}" with user approval.`,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "temporal-required",
            target_confirmed: args.target_confirmed,
            confirmationEvidence: args.confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runReclassify(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runReclassify(store);
    },
  },
};
