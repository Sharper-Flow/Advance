/**
 * Task Tools — Signal/Query Adapter Surface
 *
 * Tool-layer code fires mutation signals and reads change state from disk
 * projections, replacing the old store.executeUpdate-based mutation path.
 * rq-crossProjectTaskMutation01: target_path task mutations must route all
 * validation, signals, cache refresh, and snapshots through target store.
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import type { Store } from "../storage/store";
import {
  DelegationRecoverySchema,
  ErrorRecoverySchema,
  TaskContractRefsSchema,
  TaskTypeSchema,
  ContractEvidencePolicySchema,
  type DelegationRecovery,
  type ErrorRecovery,
  type TaskContractRefs,
  type TddReclassification,
  type Task,
  type TaskEvidencePlan,
} from "../types";
import {
  resolveTaskEvidence,
  validateTaskEvidenceForStage,
} from "../validator/task-classifier";
import { projectContractCoverage } from "../validator/contract";
import {
  formatToolOutput,
  paginate,
  resolveOutputMode,
} from "../utils/tool-output";
import { getProjectId } from "../utils/project-id";
import { maybeAttachChangeTicker } from "../storage/context-snapshot-fetch";
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
import { includeSnapshotSchema } from "./shared-args";
import { loadChange } from "../storage/change-projection-reader";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import {
  appendDraft,
  maybeCreateWisdomDraftFromErrorRecovery,
} from "../utils/wisdom-draft";
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
import { resolveProjectFeaturePolicy } from "../types";

// =============================================================================
// Helpers
// =============================================================================

/**
 * JSON-safe serialization of a `ContractCoverageProjection`. The projection's
 * `coveredIds` field is a Set (fast lookup inside the validator) and is not
 * part of the public payload — callers only need the actionable fields
 * (uncovered AC IDs, per-task entries, and cancellation metadata).
 */
function serializeContractCoverage(
  projection: ReturnType<typeof projectContractCoverage>,
): Record<string, unknown> {
  return {
    uncoveredAcceptanceCriteria: projection.uncoveredAcceptanceCriteria,
    taskCoverage: projection.taskCoverage,
    cancelledTaskIds: projection.cancelledTaskIds,
    cancelledTaskCount: projection.cancelledTaskCount,
  };
}

function listTasksFromProjection(
  state: { tasks: Task[] },
  status?: Task["status"],
  filter?: string,
): Task[] {
  let tasks = status
    ? state.tasks.filter((task) => task.status === status)
    : [...state.tasks];
  const hasKeyMatch = filter?.match(/^has_metadata_key:(.+)$/);
  const kvMatch = filter?.match(/^metadata:([^=]+)=(.+)$/);
  if (hasKeyMatch) {
    tasks = tasks.filter(
      (task) => task.metadata && hasKeyMatch[1] in task.metadata,
    );
  } else if (kvMatch) {
    tasks = tasks.filter((task) => task.metadata?.[kvMatch[1]] === kvMatch[2]);
  }
  return tasks;
}

function getReadyTasksFromProjection(state: { tasks: Task[] }) {
  const ready: Task[] = [];
  const blocked: Array<{ task: Task; blockedBy: string[] }> = [];
  for (const task of state.tasks) {
    if (task.status !== "pending") continue;
    const blockers = (task.deps ?? [])
      .filter((dep) => dep.type === "blocked_by")
      .filter((dep) => {
        const blocking = state.tasks.find(
          (candidate) => candidate.id === dep.target,
        );
        return (
          blocking &&
          blocking.status !== "done" &&
          blocking.status !== "cancelled"
        );
      })
      .map((dep) => dep.target);
    if (blockers.length === 0) ready.push(task);
    else blocked.push({ task, blockedBy: blockers });
  }
  return { ready, blocked };
}

async function mutateTaskProjection(
  store: Store,
  changeId: string,
  taskId: string,
  mutate: (task: Task) => Task,
  mutationKind: string,
  evidence: string,
): Promise<Change> {
  const outcome = await coordinateChangeMutation<Change>({
    authority: { reason: mutationKind, evidence },
    changesDir: store.paths.changes,
    intent: {
      changeId,
      mutationKind,
      mutateLatestProjection: (latest) => ({
        ...latest,
        tasks: latest.tasks.map((task) =>
          task.id === taskId ? mutate(task) : task,
        ),
      }),
      verifyProjection: (readback) => {
        const task = readback.tasks.find(
          (candidate) => candidate.id === taskId,
        );
        return task
          ? JSON.stringify(task) === JSON.stringify(mutate(task))
          : false;
      },
    },
  });
  if (outcome.kind === "verified") return outcome.value;
  throw new Error(
    outcome.kind === "unverified" || outcome.kind === "operator_required"
      ? outcome.reason
      : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
  );
}

async function addTaskToProjection(
  store: Store,
  changeId: string,
  task: Task,
): Promise<Change> {
  const outcome = await coordinateChangeMutation<Change>({
    authority: { reason: "add task", evidence: task.id },
    changesDir: store.paths.changes,
    intent: {
      changeId,
      mutationKind: "task_add",
      mutateLatestProjection: (latest) => ({
        ...latest,
        tasks: [...latest.tasks, task],
      }),
      verifyProjection: (readback) =>
        readback.tasks.some((candidate) => candidate.id === task.id),
    },
  });
  if (outcome.kind === "verified") return outcome.value;
  throw new Error(
    outcome.kind === "unverified" || outcome.kind === "operator_required"
      ? outcome.reason
      : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
  );
}

/**
 * Build a synthetic change for contract-coverage projection that reflects
 * the caller-supplied contract_refs update. The projection is computed
 * after the change would be applied so callers see coverage as it would
 * land, not the stale pre-update snapshot.
 */
function applyContractRefsToChangeProjection(
  change: Change,
  taskId: string,
  contractRefs: TaskContractRefs | undefined,
): Change {
  if (!contractRefs) return change;
  return {
    ...change,
    tasks: change.tasks.map((task) =>
      task.id === taskId ? { ...task, contract_refs: contractRefs } : task,
    ),
  };
}

/**
 * AC5: task-scoped delegation recovery is exhausted when the single allowed
 * narrower retry has been attempted and no inline diagnosis evidence exists.
 */
function isDelegationRecoveryBlocked(
  recovery: DelegationRecovery | undefined,
): boolean {
  return (
    !!recovery &&
    recovery.narrower_retry_count > 0 &&
    !recovery.inline_diagnosis_evidence
  );
}

/**
 * AC5: SEMANTIC error-recovery evidence is the only valid authority for inline
 * diagnosis. It must carry at least one documented attempt.
 */
function isSemanticInlineDiagnosisEvidence(
  errorRecovery: ErrorRecovery | undefined,
): boolean {
  return (
    !!errorRecovery &&
    errorRecovery.error_class === "SEMANTIC" &&
    (errorRecovery.attempts?.length ?? 0) > 0
  );
}

/**
 * AC5: when a task's delegation recovery is blocked, an explicit typed task
 * update that supplies SEMANTIC error-recovery evidence clears the block by
 * recording inline diagnosis evidence. Counts are preserved for history; only
 * the inline flag changes.
 */
function maybeClearBlockedDelegationRecovery(
  currentTask: Task | undefined,
  errorRecovery: ErrorRecovery | undefined,
  now: string,
): DelegationRecovery | undefined {
  if (!isDelegationRecoveryBlocked(currentTask?.delegation_recovery)) {
    return undefined;
  }
  if (!isSemanticInlineDiagnosisEvidence(errorRecovery)) {
    return undefined;
  }
  const existing = currentTask!.delegation_recovery!;
  return DelegationRecoverySchema.parse({
    ...existing,
    inline_diagnosis_evidence: true,
    last_updated_at: now,
  });
}

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
    const policy = resolveProjectFeaturePolicy(input.features);
    if (!policy.worktree_guard_enforce.value) return { decision: "ALLOW" };
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
    const policy = resolveProjectFeaturePolicy(input.features);
    if (!policy.worktree_guard_enforce.value) return { decision: "ALLOW" };
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

async function resolveChangeId(
  store: Store,
  taskId: string,
): Promise<string | null> {
  try {
    const result = await store.tasks.show(taskId);
    if (result?.changeId) return result.changeId;
  } catch (err) {
    // rq-schemaDriftToolLayer: schema errors are not recoverable via the
    // structural fallback scan below (which also reads change.json files),
    // so propagating them through the fallback would only re-encounter the
    // same corruption. Surface verbatim instead of masking as "Task not
    // found". Detection is a substring heuristic on the canonical store
    // error format ("Schema validation failed for ..."); a typed error
    // class would be cleaner but is out of scope for this task.
    if (
      err instanceof Error &&
      err.message.includes("Schema validation failed")
    ) {
      throw err;
    }
    // A stale reverse index can point store.tasks.show at an unavailable or
    // wrong workflow. Fall through to the read-only structural scan below so a
    // live active workflow can still own the task without requiring projection
    // refresh first.
  }

  // rq-reentryTaskLookup01: after re-entry, the reverse task→change index can
  // lag behind the durable change projection. Keep task-id-only tools
  // structural by scanning active/non-terminal change projections.
  let changes: Awaited<ReturnType<Store["changes"]["list"]>>["changes"];
  try {
    changes = (await store.changes.list()).changes;
  } catch (err) {
    // rq-schemaDriftToolLayer: same rationale as above — schema errors in
    // the change list are not recoverable via the per-change workflow scan.
    if (
      err instanceof Error &&
      err.message.includes("Schema validation failed")
    ) {
      throw err;
    }
    return null;
  }

  for (const change of changes) {
    if (change.status === "archived" || change.status === "closed") continue;
    const projected = await loadChange(store.paths.changes, change.id);
    if (!projected.success) {
      // This structural fallback is deliberately best-effort: corrupt or
      // unreadable projections contribute no tasks, while not_found remains
      // distinguishable as a successful null result below.
      continue;
    }
    if (projected.data?.tasks.some((task) => task.id === taskId)) {
      return change.id;
    }
  }

  return null;
}

// =============================================================================
// Tool Definitions
// =============================================================================

const taskToolDefinitions = {
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
          const projected = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          if (!projected.success) {
            return formatToolOutput({
              error: projected.error,
              code: "CHANGE_PROJECTION_LOAD_FAILED",
              projectionFailureType: projected.type,
              changeId,
            });
          }
          const state = projected.data;
          const task =
            state?.tasks?.find((candidate) => candidate.id === taskId) ?? null;
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
          // rq-wisdomAutoSurfacing01 / D1+D2: advisory-only enrichment.
          // Trigger: task.contract_refs.implements is non-empty.
          // D1: FTS-filtered wisdom (via wisdom.search) sorted by recorded_at
          //     DESC, top 5. Falls back to [] on FTS failure.
          // D2: Emit episode recall hint — plugin emits hint only, agent
          //     runtime executes the actual MCP call (DONT2: no plugin↔MCP).
          // AC10: Enrichment is advisory-only — never used to complete gates,
          // override specs/contracts, or replace task evidence.
          const implementsRefs = task.contract_refs?.implements ?? [];
          if (implementsRefs.length > 0) {
            const queryStr = implementsRefs.join(" ");
            try {
              const ftsResults = await activeStore.wisdom.search(queryStr, {
                changeId,
              });
              // Coerce missing recorded_at to '' so entries without
              // timestamps sort last (oldest) instead of throwing TypeError.
              // Prevents a data-quality bug from being silently masked as an
              // FTS failure by the surrounding try/catch.
              const sorted = [...ftsResults]
                .sort((a, b) =>
                  (b.recorded_at || "").localeCompare(a.recorded_at || ""),
                )
                .slice(0, 5);
              output._relevantWisdom = sorted;
            } catch {
              // D1 fallback: empty list on FTS failure (advisory-only).
              output._relevantWisdom = [];
            }
            const projectId = await getProjectId(activeStore.paths.root);
            output._episodeRecallHint = {
              namespace: projectId ?? activeStore.paths.root,
              query: queryStr,
              top_k: 3,
            };
          } else {
            output._relevantWisdom = [];
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
      outputMode: z
        .enum(["compact", "pretty"])
        .optional()
        .describe(
          "Output mode: compact (default) or pretty. Overrides ADV_TOOL_OUTPUT_MODE env var for this call.",
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
        outputMode?: "compact" | "pretty";
      },
      store: Store,
    ) => {
      const {
        changeId,
        status,
        filter,
        limit,
        offset,
        target_path,
        outputMode,
      } = args;
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const projected = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          let tasks: Task[];
          if (!projected.success) {
            // Task listing is advisory and deliberately degrades corrupt,
            // oversized, or unreadable projections to an empty list.
            tasks = [];
          } else if (!projected.data) {
            // A missing projection is a successful null result, kept distinct
            // from the explicit corruption degradation above.
            tasks = [];
          } else {
            tasks = listTasksFromProjection(projected.data, status, filter);
          }
          const paged = paginate(tasks, {
            limit,
            offset,
            tool: "adv_task_list",
            args: `changeId: "${changeId}"${status ? `, status: "${status}"` : ""}${filter ? `, filter: "${filter}"` : ""}`,
          });
          return formatToolOutput(
            {
              tasks: paged.items,
              pagination: paged.pagination,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            },
            { pretty: resolveOutputMode(outputMode) },
          );
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
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      {
        changeId,
        target_path,
        include,
      }: {
        changeId: string;
        target_path?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const projected = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          let result: ReturnType<typeof getReadyTasksFromProjection>;
          if (!projected.success) {
            // Ready-task discovery is advisory and deliberately returns no
            // tasks on corrupt projections instead of failing the query.
            result = { ready: [], blocked: [] };
          } else if (!projected.data) {
            // Keep not_found distinct from the explicit corrupt/failed branch.
            result = { ready: [], blocked: [] };
          } else {
            result = getReadyTasksFromProjection(projected.data);
          }
          const formatted = formatTaskReadyOutput({
            ready: result.ready.map((t) => ({
              id: t.id,
              content: t.title,
              status: t.status,
              metadata: t.metadata,
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
          const output: Record<string, unknown> = {
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
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };
          await maybeAttachChangeTicker(output, include, activeStore, changeId);
          return formatToolOutput(output);
        },
      );
    },
  },

  adv_task_update: {
    description:
      "Update task status. NOTE: To cancel a task, use adv_task_cancel instead — direct cancellation via this tool is not allowed. To mark a task done in normal apply flow, use adv_task_checkpoint so git checkpoint metadata is recorded.",
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
      tdd_intent: z
        .enum(["inline", "separate_verification", "not_applicable"])
        .optional()
        .describe(
          "Set or reclassify the task TDD intent. Requires tdd_reason, approvedByUser:true, and approvalEvidence.",
        ),
      tdd_reason: z
        .string()
        .optional()
        .describe("Why the task TDD intent is being changed."),
      approvedByUser: z
        .literal(true)
        .optional()
        .describe("Required when changing tdd_intent."),
      approvalEvidence: z
        .string()
        .optional()
        .describe("User approval evidence for changing tdd_intent."),
      contract_refs: TaskContractRefsSchema.optional().describe(
        "Structured links from this task to approved change-contract items. Only implements/verifies cover success or acceptance criteria; respects traces constraints/avoidances and never covers acceptance criteria.",
      ),
      evidence_policy: ContractEvidencePolicySchema.optional().describe(
        "Pre-planning evidence-plan repair: select the evidence policy. May change only while planning is pending.",
      ),
      proof_target: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe("Pre-planning evidence-plan repair: non-empty proof target."),
      evidence_rationale: z
        .string()
        .trim()
        .optional()
        .describe(
          "Pre-planning evidence-plan repair: bounded rationale for a behavior-critical non-test route. Reviewer evidence is reviewer-owned.",
        ),
      restartImplementationCycle: z
        .boolean()
        .optional()
        .describe(
          "When starting an in-progress frontend task, supersedes its existing implementation cycle. Normal resumes preserve the current cycle.",
        ),
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project's disk-backed store.",
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
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      args: {
        taskId: string;
        status: "pending" | "in_progress" | "blocked" | "done" | "cancelled";
        notes?: string;
        implementation_summary?: string;
        error_recovery?: ErrorRecovery;
        tdd_intent?: "inline" | "separate_verification" | "not_applicable";
        tdd_reason?: string;
        approvedByUser?: true;
        approvalEvidence?: string;
        contract_refs?: TaskContractRefs;
        restartImplementationCycle?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        evidence_policy?: import("../types").ContractEvidencePolicy;
        evidence_rationale?: string;
        proof_target?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      const evidenceRepairRequested =
        args.evidence_policy !== undefined ||
        args.evidence_rationale !== undefined ||
        args.proof_target !== undefined;
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
          // Build deps whenever a change is known — not only for auto_managed
          // changes — so the existing-worktree ALLOW probe
          // (rq-worktreeMutationGuard01.4) is reachable for non-auto-managed
          // (block_only) changes. Guarded-status gating still applies inside
          // evaluateTaskUpdateWorktreeIsolation, and the broadening is
          // low-regression (resumeRuntime-only deps; no attachment signals).
          autoManageDeps: changeForGuard
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
        const currentTask =
          taskRecord?.task ??
          changeForGuard?.tasks.find((task) => task.id === args.taskId);
        if (args.tdd_intent !== undefined) {
          if (args.approvedByUser !== true) {
            return formatToolOutput({
              error: "approvedByUser must be true when changing tdd_intent.",
              changeId,
              taskId: args.taskId,
            });
          }
          if (!args.tdd_reason?.trim() || !args.approvalEvidence?.trim()) {
            return formatToolOutput({
              error:
                "tdd_reason and approvalEvidence are required when changing tdd_intent.",
              changeId,
              taskId: args.taskId,
            });
          }
          if (!currentTask) {
            return formatToolOutput({
              error: `Task not found: ${args.taskId}`,
              changeId,
              taskId: args.taskId,
            });
          }
          if (currentTask.metadata?.tdd_intent === args.tdd_intent) {
            return formatToolOutput({
              error: `Task ${args.taskId} already has tdd_intent="${args.tdd_intent}".`,
              changeId,
              taskId: args.taskId,
            });
          }
        }
        const tddReclassification: TddReclassification | undefined =
          args.tdd_intent !== undefined && currentTask
            ? {
                from_intent: currentTask.metadata?.tdd_intent ?? "none",
                to_intent: args.tdd_intent,
                reason: args.tdd_reason!,
                approved_by_user: true,
                approval_evidence: args.approvalEvidence!,
                approved_at: now,
              }
            : undefined;
        const clearedDelegationRecovery = maybeClearBlockedDelegationRecovery(
          currentTask,
          args.error_recovery,
          now,
        );
        const shouldPatchExistingDoneTask =
          Boolean(args.contract_refs) &&
          args.status === "done" &&
          currentStatus === "done";

        // Pre-planning evidence-plan repair: only allowed before the planning
        // gate is complete. After planning closes, reviewer-owned evidence is
        // the only valid authority for non-test behavior-critical routes, so
        // pre-planning repair would undermine the contract.
        let evidencePlanRepair: TaskEvidencePlan | undefined;
        if (evidenceRepairRequested) {
          if (args.status !== "pending") {
            return formatToolOutput({
              error:
                "Evidence plan repair requires status:'pending' so plan authority cannot change while work is active or complete.",
              code: "EVIDENCE_PLAN_REPAIR_REQUIRES_PENDING",
              changeId,
              taskId: args.taskId,
            });
          }
          const gatesForRepair = await activeStore.gates.get(changeId);
          if (gatesForRepair && gatesForRepair.planning.status === "done") {
            return formatToolOutput({
              error: `Cannot repair evidence plan after planning gate is complete. Submit an adv-reviewer report to provide reviewer-owned evidence, or use adv_change_reenter to reopen the planning gate for scope expansion.`,
              code: "EVIDENCE_PLAN_REPAIR_AFTER_PLANNING",
              changeId,
              taskId: args.taskId,
            });
          }
          const existingTask =
            currentTask ??
            changeForGuard?.tasks.find((task) => task.id === args.taskId);
          if (!existingTask) {
            return formatToolOutput({
              error: `Task not found in change ${changeId}: ${args.taskId}`,
              changeId,
              taskId: args.taskId,
            });
          }
          const existingResolution = resolveTaskEvidence(existingTask);
          const mergedPolicy =
            args.evidence_policy ?? existingResolution.policy ?? "test";
          const candidate: Task = {
            ...existingTask,
            ...(args.evidence_policy !== undefined
              ? { evidence_policy: args.evidence_policy }
              : {}),
            evidence_plan: {
              policy: mergedPolicy,
              proof_target:
                args.proof_target ?? existingResolution.proof_target ?? "",
              ...(args.evidence_rationale !== undefined
                ? { rationale: args.evidence_rationale }
                : {}),
              ...(existingTask.evidence_plan?.review_conclusion
                ? {
                    review_conclusion:
                      existingTask.evidence_plan.review_conclusion,
                  }
                : {}),
              ...(existingTask.evidence_plan?.review_evidence_ref
                ? {
                    review_evidence_ref:
                      existingTask.evidence_plan.review_evidence_ref,
                  }
                : {}),
              provenance: "new",
              stage: "stage-v2",
            },
          };
          const repairedResolution = resolveTaskEvidence(candidate);
          const repairValidation = validateTaskEvidenceForStage(
            candidate,
            "prep",
          );
          if (!repairValidation.valid) {
            return formatToolOutput({
              error: `Invalid evidence plan repair: ${repairValidation.errors.join("; ")}`,
              code: "EVIDENCE_PLAN_REPAIR_INVALID",
              changeId,
              taskId: args.taskId,
            });
          }
          evidencePlanRepair = {
            policy: repairedResolution.policy!,
            proof_target: repairedResolution.proof_target!,
            ...(args.evidence_rationale !== undefined
              ? { rationale: args.evidence_rationale }
              : {}),
            ...(existingTask.evidence_plan?.review_conclusion
              ? {
                  review_conclusion:
                    existingTask.evidence_plan.review_conclusion,
                }
              : {}),
            ...(existingTask.evidence_plan?.review_evidence_ref
              ? {
                  review_evidence_ref:
                    existingTask.evidence_plan.review_evidence_ref,
                }
              : {}),
            provenance: "new",
            stage: "stage-v2",
          };
        }

        if (args.status === "done" && !shouldPatchExistingDoneTask) {
          return formatToolOutput({
            error:
              "Normal task completion must go through adv_task_checkpoint so git checkpoint metadata, touched files, and verification are recorded before the task is marked done.",
            code: "TASK_DONE_REQUIRES_CHECKPOINT",
            hint: "Run adv_task_checkpoint with mode:'complete'. Use adv_task_update status:'done' only to patch an already-done task's metadata/contract refs.",
            changeId,
            taskId: args.taskId,
          });
        }

        const mutateRecoveredTask = (task: Task) => {
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
            ...(clearedDelegationRecovery && {
              delegation_recovery: clearedDelegationRecovery,
            }),
            ...(args.contract_refs && {
              contract_refs: args.contract_refs,
            }),
            ...(evidencePlanRepair && {
              evidence_policy: evidencePlanRepair.policy,
              evidence_plan: evidencePlanRepair,
            }),
            ...(tddReclassification && {
              metadata: {
                ...task.metadata,
                tdd_intent: tddReclassification.to_intent,
              },
              tdd_reclassification: tddReclassification,
            }),
          };
          // rq-wisdomAutoSurfacing01 / D4: when error_recovery carries a
          // SEMANTIC class with non-empty attempts and the task has no
          // existing suggested draft, auto-create one WisdomDraft and merge
          // into the task's wisdom_drafts[] (task-scoped per AC7).
          if (args.error_recovery) {
            const newDraft = maybeCreateWisdomDraftFromErrorRecovery(
              task,
              args.error_recovery,
              now,
            );
            if (newDraft) {
              patch.wisdom_drafts = appendDraft(task.wisdom_drafts, newDraft);
            }
          }
          if (args.status === "in_progress") {
            patch.assignedTo = "agent";
            patch.started_at = task.started_at ?? now;
          } else if (args.status === "done") {
            patch.completed_at = now;
            patch.completedAt = now;
            patch.verification =
              args.notes ??
              args.implementation_summary ??
              "Task marked done via adv_task_update";
          }
          return { ...task, ...patch } as Task;
        };
        await mutateTaskProjection(
          activeStore,
          changeId,
          args.taskId,
          mutateRecoveredTask,
          "task_mutation",
          args.notes ?? args.implementation_summary ?? args.status,
        );
        const recoveredViaPoisoned = false;

        let task: Task | null = null;
        if (!recoveredViaPoisoned) {
          const projected = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          if (!projected.success) {
            return formatToolOutput({
              success: false,
              error: projected.error,
              code: "CHANGE_PROJECTION_LOAD_FAILED",
              projectionFailureType: projected.type,
              changeId,
            });
          }
          task =
            projected.data?.tasks?.find(
              (candidate) => candidate.id === args.taskId,
            ) ?? null;
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
        };
        // Surface cancellation-aware implements/verifies coverage for both
        // repair and routine updates; tests and downstream prompts can rely
        // on this shape being present whenever a successful task update is
        // returned. Project against the post-update change so caller-supplied
        // contract_refs are reflected in the projection.
        if (changeForGuard) {
          const projectionChange = applyContractRefsToChangeProjection(
            changeForGuard,
            args.taskId,
            args.contract_refs,
          );
          output.contractCoverage = serializeContractCoverage(
            projectContractCoverage(projectionChange),
          );
        }
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
          await maybeAttachChangeTicker(
            output,
            args.include,
            activeStore,
            changeId,
          );
        }
        return formatToolOutput(output);
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "authoritative",
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
      type: TaskTypeSchema.default("code").describe(
        "Task type — classifies the deliverable kind (code, docs, ops, research, approval, verification). Defaults to 'code' for backward compatibility.",
      ),
      evidence_policy: ContractEvidencePolicySchema.optional().describe(
        "Evidence policy that governs what kind of proof satisfies task completion (e.g., 'test', 'review', 'source_citation', 'stakeholder_acceptance').",
      ),
      evidence_rationale: z
        .string()
        .trim()
        .optional()
        .describe(
          "Bounded rationale for a non-test evidence route on behavior-critical work. Required at prep; reviewer-owned evidence is required later at completion.",
        ),
      review_conclusion: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          "Legacy compatibility input. New stage-v2 tasks do not accept caller prose as reviewer authority; persisted task-scoped reviewer reports supply completion evidence.",
        ),
      metadata: z
        .record(z.string(), z.string())
        .optional()
        .describe("Optional task metadata (e.g., { tdd_intent: 'inline' })"),
      contract_refs: TaskContractRefsSchema.optional().describe(
        "Structured links from this task to approved change-contract items. Only implements/verifies cover success or acceptance criteria; respects traces constraints/avoidances and never covers acceptance criteria.",
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
      ...targetPathSchema.shape,
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      args: {
        changeId: string;
        content: string;
        type?: import("../types").TaskType;
        evidence_policy?: import("../types").ContractEvidencePolicy;
        evidence_rationale?: string;
        review_conclusion?: string;
        metadata?: Record<string, string>;
        contract_refs?: TaskContractRefs;
        blockedBy?: string[];
        section?: string;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      const runAdd = async (
        activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const {
          changeId,
          content,
          type,
          evidence_policy,
          evidence_rationale,
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
          // Broaden deps so the existing-worktree ALLOW probe is reachable for
          // non-auto-managed changes (rq-worktreeMutationGuard01.4). task_add is
          // a pure signal (no file write); an existing setup-ready worktree
          // makes blocking from main pointless. Low-regression (resumeRuntime-only).
          autoManageDeps: changeForGuard
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

        // P1.12 Scope C: validate blockedBy task IDs exist in this change
        if (blockedBy && blockedBy.length > 0) {
          const projected = await loadChange(
            activeStore.paths.changes,
            changeId,
          );
          if (!projected.success) {
            return formatToolOutput({
              error: projected.error,
              code: "CHANGE_PROJECTION_LOAD_FAILED",
              projectionFailureType: projected.type,
              changeId,
            });
          }
          const tasks = projected.data?.tasks ?? [];
          const validIdSet = new Set(tasks.map((t) => t.id));
          const unknown = blockedBy.filter((id) => !validIdSet.has(id));
          if (unknown.length > 0) {
            return formatToolOutput({
              error:
                unknown.length === 1
                  ? `Unknown task ID in blockedBy: '${unknown[0]}' does not exist in change '${changeId}'.`
                  : `Unknown task IDs in blockedBy: ${unknown.map((id) => `'${id}'`).join(", ")} do not exist in change '${changeId}'.`,
              hint: projected.data
                ? `Read canonical task IDs from 'adv_task_list changeId: ${changeId}' and copy exact IDs into blockedBy.`
                : `Canonical change.json task reads are unavailable for '${changeId}'. Run adv_doctor and stop; do not retry in a loop while projection health is degraded.`,
              unknownTaskIds: unknown,
              validTaskIds: Array.from(validIdSet),
            });
          }
        }

        // Query current tasks to compute next priority
        const projected = await loadChange(activeStore.paths.changes, changeId);
        if (!projected.success) {
          return formatToolOutput({
            error: projected.error,
            code: "CHANGE_PROJECTION_LOAD_FAILED",
            projectionFailureType: projected.type,
            changeId,
          });
        }
        const tasks = projected.data?.tasks ?? [];
        const nextPriority =
          tasks.length === 0
            ? 0
            : Math.max(...tasks.map((t) => t.priority ?? 0)) + 1;

        const mergedMetadata = { ...metadata };
        if (!mergedMetadata.tdd_intent) {
          switch (type ?? "code") {
            case "code":
              mergedMetadata.tdd_intent = "inline";
              break;
            case "verification":
              mergedMetadata.tdd_intent = "separate_verification";
              break;
            case "docs":
            case "research":
            case "approval":
            case "ops":
              mergedMetadata.tdd_intent = "not_applicable";
              break;
          }
        }

        const now = new Date().toISOString();
        const task: Task = {
          id: makeTaskId(),
          title: content.split("\n")[0] || content,
          type: type ?? "code",
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
          ...(evidence_policy ? { evidence_policy } : {}),
        };

        // Normalize evidence plan so every newly planned task carries exactly
        // one policy, one proof target, and explicit compatibility provenance.
        const evidenceResolution = resolveTaskEvidence(task);
        const evidencePlan: TaskEvidencePlan = {
          policy: evidenceResolution.policy!,
          proof_target: evidenceResolution.proof_target!,
          ...(evidence_rationale ? { rationale: evidence_rationale } : {}),
          provenance: "new",
          stage: "stage-v2",
        };
        task.evidence_plan = evidencePlan;

        const validatedEvidenceResolution = validateTaskEvidenceForStage(
          task,
          "prep",
        );
        if (!validatedEvidenceResolution.valid) {
          return formatToolOutput({
            error: `Invalid evidence plan: ${validatedEvidenceResolution.errors.join("; ")}`,
            changeId,
          });
        }

        await addTaskToProjection(activeStore, changeId, task);
        const recoveredViaPoisoned = false;

        const output: Record<string, unknown> = {
          taskId: task.id,
          task,
          ...(changeForGuard
            ? {
                contractCoverage: serializeContractCoverage(
                  projectContractCoverage({
                    ...changeForGuard,
                    tasks: [...changeForGuard.tasks, task],
                  }),
                ),
              }
            : {}),
          ...(projectContext ? { _projectContext: projectContext } : {}),
        };
        if (!recoveredViaPoisoned) {
          await maybeAttachChangeTicker(
            output,
            args.include,
            activeStore,
            changeId,
          );
        }
        return formatToolOutput(output);
      };

      try {
        if (args.target_path) {
          return withTargetPathStore(
            {
              currentProjectPath: store.paths.root,
              target_path: args.target_path,
              stateRequirement: "authoritative",
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
      ...targetPathSchema.shape,
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      args: {
        taskIds: string[];
        reasons: Record<string, string>;
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: Record<string, string>;
        dryRun?: boolean;
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
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
            const mutateCancelledTask = (task: Task) =>
              ({
                ...task,
                status: "cancelled",
                completed_at: now,
                completedAt: now,
                notes: reasons[taskId],
              }) as Task;

            await mutateTaskProjection(
              activeStore,
              changeId,
              taskId,
              mutateCancelledTask,
              "task_cancelled",
              approvalEvidence,
            );
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
            await maybeAttachChangeTicker(
              output,
              args.include,
              activeStore,
              changeId,
            );
          }
        }

        return formatToolOutput(output);
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "authoritative",
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
        const now = new Date().toISOString();

        const reclassification: TddReclassification = {
          from_intent: currentIntent ?? "none",
          to_intent: args.toIntent,
          reason: args.reason,
          approved_by_user: true,
          approval_evidence: args.approvalEvidence,
          approved_at: now,
        };

        // Recompute the normalized evidence plan for the reclassified intent.
        // Materially reclassified tasks carry provenance 'reclassified' and one
        // explicit policy/proof target.
        const updatedTask: Task = {
          ...task,
          metadata: {
            ...task.metadata,
            tdd_intent: args.toIntent,
          },
          tdd_reclassification: reclassification,
        };
        const evidenceResolution = resolveTaskEvidence(updatedTask);
        if (!evidenceResolution.valid) {
          return formatToolOutput({
            error: `Invalid evidence plan: ${evidenceResolution.errors.join("; ")}`,
            changeId,
          });
        }
        const evidencePlan: TaskEvidencePlan = {
          policy: evidenceResolution.policy!,
          proof_target: evidenceResolution.proof_target!,
          ...(evidenceResolution.rationale
            ? { rationale: evidenceResolution.rationale }
            : {}),
          ...(evidenceResolution.review_conclusion
            ? { review_conclusion: evidenceResolution.review_conclusion }
            : {}),
          provenance: "reclassified",
        };

        await mutateTaskProjection(
          activeStore,
          changeId,
          args.taskId,
          (current) => ({
            ...current,
            metadata: updatedTask.metadata,
            tdd_reclassification: reclassification,
            evidence_plan: evidencePlan,
          }),
          "task_tdd_reclassified",
          args.approvalEvidence,
        );

        return formatToolOutput({
          success: true,
          taskId: args.taskId,
          reclassification,
          evidence_plan: evidencePlan,
          message: `Reclassified tdd_intent from "${currentIntent}" to "${args.toIntent}" with user approval.`,
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (args.target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path: args.target_path,
            stateRequirement: "authoritative",
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

const {
  adv_task_reclassify_tdd: _advTaskReclassifyTddDefinition,
  ...taskTools
} = taskToolDefinitions;

export { taskTools };
