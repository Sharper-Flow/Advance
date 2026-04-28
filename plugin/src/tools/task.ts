/**
 * Task Tools
 *
 * Tools for managing tasks within changes.
 * All are data tools returning pure JSON.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import {
  isTrivialTask,
  truncateOutput,
  ErrorRecoverySchema,
  type Cancellation,
  type ErrorRecovery,
  type TddReclassification,
} from "../types";
import {
  getTaskTddCompliance,
  requiresTddEvidence,
} from "../validator/task-classifier";
import { validateEvidenceSemantics } from "../validator/evidence";
import { formatToolOutput, paginate } from "../utils/tool-output";
import { fetchChangeContextTicker } from "../storage/context-snapshot-fetch";
import {
  formatTaskReadyOutput,
  formatDoomLoopDiagnostics,
} from "../utils/tool-formatters";

// =============================================================================
// Tool Definitions
// =============================================================================

export const taskTools = {
  adv_task_show: {
    description:
      "Get full details of a single task by ID, including its parent change ID. Use when you have a task ID but need the complete task object.",
    args: {
      taskId: z.string().describe("Task ID (e.g., 'tk-Hf7dK2mN')"),
    },
    execute: async ({ taskId }: { taskId: string }, store: Store) => {
      const result = await store.tasks.show(taskId);
      if (!result) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }
      const output: Record<string, unknown> = {
        task: result.task,
        changeId: result.changeId,
      };
      if (result.task.error_recovery) {
        output.formatted_doom_loop = formatDoomLoopDiagnostics(
          result.task.error_recovery,
        );
      }
      return formatToolOutput(output);
    },
  },

  adv_task_run_status: {
    description:
      "Show durable task-run lifecycle status for a task: phase, required next action, resume hint, and recent ledger events.",
    args: {
      taskId: z.string().describe("Task ID to inspect"),
    },
    execute: async ({ taskId }: { taskId: string }, store: Store) => {
      const shown = await store.tasks.show(taskId);
      if (!shown) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      const run = await store.tasks.getRun(taskId);
      if (!run) {
        return formatToolOutput({
          taskId,
          changeId: shown.changeId,
          phase: "not_started",
          requiredNextAction: "start_task",
          resumeHint:
            "No durable task-run ledger exists yet. Start task execution with adv_task_update status:'in_progress'.",
          baseline: null,
          evidence: null,
          verification: null,
          checkpoint: null,
          lastEvents: [],
        });
      }

      return formatToolOutput({
        taskId,
        changeId: shown.changeId,
        phase: run.phase,
        requiredNextAction: run.requiredNextAction,
        resumeHint: run.resumeHint,
        baseline: run.baseline ?? null,
        evidence: run.evidence ?? null,
        verification: run.verification ?? null,
        checkpoint: run.checkpoint ?? null,
        attempts: run.attempts ?? [],
        lastEvents: run.events.slice(-5),
      });
    },
  },

  // rq-advmeta01: Task Metadata Filter Semantics
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
    },
    execute: async (
      {
        changeId,
        status,
        filter,
        limit,
        offset,
      }: {
        changeId: string;
        status?: string;
        filter?: string;
        limit?: number;
        offset?: number;
      },
      store: Store,
    ) => {
      const tasks = await store.tasks.list(changeId, status, filter);
      const paged = paginate(tasks, {
        limit,
        offset,
        tool: "adv_task_list",
        args: `changeId: "${changeId}"${status ? `, status: "${status}"` : ""}${filter ? `, filter: "${filter}"` : ""}`,
      });
      return formatToolOutput({
        tasks: paged.items,
        pagination: paged.pagination,
      });
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
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      const result = await store.tasks.ready(changeId);
      const snapshot = await fetchChangeContextTicker(store, changeId);
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
      return formatToolOutput({
        ...result,
        formatted,
        ...(snapshot ? { _contextSnapshot: snapshot } : {}),
      });
    },
  },

  adv_task_update: {
    description:
      "Update task status. NOTE: To cancel a task, use adv_task_cancel instead — direct cancellation via this tool is not allowed.",
    args: {
      taskId: z.string().describe("Task ID"),
      status: z
        .enum(["pending", "in_progress", "done", "cancelled"])
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
    },
    execute: async (
      {
        taskId,
        status,
        notes,
        implementation_summary,
        error_recovery,
      }: {
        taskId: string;
        status: string;
        notes?: string;
        implementation_summary?: string;
        error_recovery?: ErrorRecovery;
      },
      store: Store,
    ) => {
      // Reject direct cancellation — must use adv_task_cancel with user approval
      if (status === "cancelled") {
        return formatToolOutput({
          error:
            "Direct task cancellation is not allowed. Use adv_task_cancel instead, which requires presenting cancellation reasons to the user and obtaining explicit approval.",
          hint: "Call adv_task_cancel with taskIds, reasons (per task), and user approval evidence.",
        });
      }

      // Resolve changeId for snapshot emission (rq-ctxsnap2.3 compliance)
      const taskShowResult = await store.tasks.show(taskId);
      const changeId = taskShowResult?.changeId;

      const task = await store.tasks.update(
        taskId,
        status,
        notes,
        implementation_summary,
        error_recovery,
      );
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      // Emit snapshot on meaningful transitions (in_progress, done)
      const output: Record<string, unknown> = { success: true, task };
      if (status === "in_progress") {
        const recorded = await store.tasks.recordRunEvent(taskId, {
          idempotencyKey: `${taskId}:start:${task.started_at ?? "unknown"}`,
          type: "start",
          recordedAt: task.started_at ?? new Date().toISOString(),
          payload: {},
        });
        if (recorded) {
          output.taskRun = {
            phase: recorded.run.phase,
            requiredNextAction: recorded.run.requiredNextAction,
            duplicate: recorded.duplicate,
          };
        }
      }
      if (task.error_recovery) {
        output.formatted_doom_loop = formatDoomLoopDiagnostics(
          task.error_recovery,
        );
      }
      if (changeId && (status === "in_progress" || status === "done")) {
        const snapshot = await fetchChangeContextTicker(store, changeId);
        if (snapshot) {
          output._contextSnapshot = snapshot;
        }
      }

      return formatToolOutput(output);
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
    },
    execute: async (
      {
        changeId,
        content,
        metadata,
        blockedBy,
        section,
      }: {
        changeId: string;
        content: string;
        metadata?: Record<string, string>;
        blockedBy?: string[];
        section?: string;
      },
      store: Store,
    ) => {
      try {
        // Planning-gate lock: reject task creation after planning gate is complete
        const gates = await store.gates.get(changeId);
        if (gates && gates.planning.status === "done") {
          return formatToolOutput({
            error: `Cannot add tasks after planning gate is complete. Use adv_task_reclassify_tdd to modify existing task TDD intent, or use adv_change_reenter to reopen the planning gate for scope expansion.`,
          });
        }

        // P1.12 Scope C: validate blockedBy task IDs exist in this change
        // before creating the new task. Silently accepting unknown IDs
        // breaks the dependency graph — downstream tasks wait on phantom
        // predecessors. Surface valid IDs in the response so the agent
        // can self-correct without a second tool call.
        if (blockedBy && blockedBy.length > 0) {
          const existingChange = await store.changes.get(changeId);
          if (existingChange.success && existingChange.data) {
            const validTaskIds = existingChange.data.tasks.map((t) => t.id);
            const validIdSet = new Set(validTaskIds);
            const unknown = blockedBy.filter((id) => !validIdSet.has(id));
            if (unknown.length > 0) {
              return formatToolOutput({
                error:
                  unknown.length === 1
                    ? `Unknown task ID in blockedBy: '${unknown[0]}' does not exist in change '${changeId}'.`
                    : `Unknown task IDs in blockedBy: ${unknown.map((id) => `'${id}'`).join(", ")} do not exist in change '${changeId}'.`,
                hint: `Fetch the current task IDs with 'adv_task_list changeId: ${changeId}' and copy exact IDs into blockedBy.`,
                unknownTaskIds: unknown,
                validTaskIds,
              });
            }
          }
        }

        // Default tdd_intent to "inline" when not provided — prevents
        // TASK_TDD_INTENT_MISSING warnings in prep readiness and avoids
        // cancel-and-recreate friction during /adv-prep.
        //
        // "inline" is the preferred default because the RSTC protocol runs
        // red/green phases within each task. "separate_verification" is for
        // cross-cutting verification tasks that can't be tied to a single
        // implementation task. "not_applicable" is for non-code tasks (docs,
        // config) where TDD doesn't apply.
        const mergedMetadata = { ...metadata };
        if (!mergedMetadata.tdd_intent) {
          mergedMetadata.tdd_intent = "inline";
        }

        const task = await store.tasks.add(changeId, content, {
          metadata: mergedMetadata,
          blockedBy,
          section,
        });
        const snapshot = await fetchChangeContextTicker(store, changeId);
        return formatToolOutput({
          taskId: task.id,
          task,
          ...(snapshot ? { _contextSnapshot: snapshot } : {}),
        });
      } catch (error) {
        return formatToolOutput({
          error: error instanceof Error ? error.message : "Failed to add task",
        });
      }
    },
  },

  adv_task_evidence: {
    description:
      "Record TDD evidence (red/green phase) for a task. Captures test file, command, output, and exit code for audit trail.",
    args: {
      taskId: z.string().describe("Task ID"),
      phase: z
        .enum(["red", "green"])
        .describe("TDD phase (red=failing test, green=passing test)"),
      testFile: z
        .string()
        .optional()
        .describe("Test file or test name that was run"),
      command: z.string().optional().describe("Command used to run the test"),
      output: z
        .string()
        .optional()
        .describe("Test output (will be truncated to 80 chars)"),
      exitCode: z
        .number()
        .optional()
        .describe("Exit code from test runner (0=pass, non-zero=fail)"),
    },
    execute: async (
      {
        taskId,
        phase,
        testFile,
        command,
        output,
        exitCode,
      }: {
        taskId: string;
        phase: "red" | "green";
        testFile?: string;
        command?: string;
        output?: string;
        exitCode?: number;
      },
      store: Store,
    ) => {
      // Validate exit-code semantics before recording
      const validation = validateEvidenceSemantics(phase, exitCode);
      if (!validation.valid) {
        return formatToolOutput({
          error: `Evidence rejected: ${validation.reason}`,
          phase,
          exitCode,
        });
      }

      const evidence = {
        recorded_at: new Date().toISOString(),
        test_file: testFile,
        command,
        output_snippet: output ? truncateOutput(output) : undefined,
        exit_code: exitCode,
      };

      const task = await store.tasks.recordEvidence(taskId, phase, evidence);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      return formatToolOutput({
        success: true,
        task,
        compliance: getTaskTddCompliance(task),
        message: `Recorded ${phase} phase evidence for task ${taskId}`,
      });
    },
  },

  adv_task_tdd: {
    description: "Set or inspect TDD state for a task (action=set|status)",
    args: {
      taskId: z.string().describe("Task ID"),
      action: z
        .enum(["set", "status"])
        .describe("Whether to set the phase or inspect TDD status"),
      phase: z
        .enum(["none", "red", "green", "refactor", "complete"])
        .optional()
        .describe("Required when action=set; ignored for action=status"),
    },
    execute: async (
      {
        taskId,
        action,
        phase,
      }: {
        taskId: string;
        action: "set" | "status";
        phase?: "none" | "red" | "green" | "refactor" | "complete";
      },
      store: Store,
    ) => {
      if (action === "set") {
        if (!phase) {
          return formatToolOutput({
            error: "phase is required when action='set'",
          });
        }
        const updated = await store.tasks.setPhase(taskId, phase);
        if (!updated) {
          return formatToolOutput({ error: `Task not found: ${taskId}` });
        }

        return formatToolOutput({
          success: true,
          action,
          task: updated,
          message: `Set TDD phase to '${phase}' for task ${taskId}`,
        });
      }

      const task = await store.tasks.get(taskId);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      const compliance = getTaskTddCompliance(task);
      const requiresTdd = requiresTddEvidence(task);
      const trivial = isTrivialTask(task.title);

      return formatToolOutput({
        action,
        taskId: task.id,
        title: task.title,
        tdd_phase: task.tdd_phase,
        tdd_evidence: task.tdd_evidence,
        analysis: {
          requires_tdd: requiresTdd,
          is_trivial: trivial,
          compliance,
        },
        recommendation:
          compliance === "missing"
            ? "Record TDD evidence with adv_run_test (preferred) or adv_task_evidence for externally obtained evidence; reclassify with adv_task_reclassify_tdd when TDD is not applicable"
            : compliance === "compliant"
              ? "TDD requirements satisfied"
              : "TDD not required for this task type",
      });
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
    },
    execute: async (
      {
        taskIds,
        reasons,
        approvedByUser,
        approvalEvidence,
        supersededBy,
      }: {
        taskIds: string[];
        reasons: Record<string, string>;
        approvedByUser: true;
        approvalEvidence: string;
        supersededBy?: Record<string, string>;
      },
      store: Store,
    ) => {
      // Validate every task has a reason
      const missingReasons = taskIds.filter((id) => !reasons[id]);
      if (missingReasons.length > 0) {
        return formatToolOutput({
          error: `Missing cancellation reason for tasks: ${missingReasons.join(", ")}. Every task requires a per-task reason.`,
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
      // Partial cancellations leave the dependency graph in a confusing
      // mid-state when the agent passes wrong IDs. Fail-fast before any
      // task is mutated so the agent can correct the call and retry.
      const unknownTaskIds: string[] = [];
      for (const taskId of taskIds) {
        const existing = await store.tasks.get(taskId);
        if (!existing) {
          unknownTaskIds.push(taskId);
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

      const results: Array<{
        taskId: string;
        success: boolean;
        error?: string;
      }> = [];
      const cancelledTasks: Array<{ id: string; title: string }> = [];
      const now = new Date().toISOString();

      for (const taskId of taskIds) {
        const cancellation: Cancellation = {
          reason: reasons[taskId],
          approved_by_user: true,
          approval_evidence: approvalEvidence,
          superseded_by: supersededBy?.[taskId],
          approved_at: now,
        };

        const task = await store.tasks.cancel(taskId, cancellation);
        if (!task) {
          results.push({
            taskId,
            success: false,
            error: `Task not found: ${taskId}`,
          });
        } else {
          results.push({ taskId, success: true });
          cancelledTasks.push({ id: task.id, title: task.title });
        }
      }

      const allSuccess = results.every((r) => r.success);

      // Emit snapshot only when at least one task was cancelled successfully
      const output: Record<string, unknown> = {
        success: allSuccess,
        cancelled: cancelledTasks,
        results,
        message: allSuccess
          ? `Cancelled ${cancelledTasks.length} task(s) with user approval.`
          : `Partial cancellation: ${results.filter((r) => r.success).length}/${taskIds.length} succeeded.`,
      };

      if (cancelledTasks.length > 0) {
        // Resolve changeId from the first successfully cancelled task.
        // store.tasks.show() may return null on store-level failure — guard
        // against that to avoid emitting a snapshot with undefined changeId.
        const firstTask = await store.tasks.show(cancelledTasks[0].id);
        const changeId = firstTask?.changeId;
        if (changeId) {
          const snapshot = await fetchChangeContextTicker(store, changeId);
          if (snapshot) {
            output._contextSnapshot = snapshot;
          }
        }
      }

      return formatToolOutput(output);
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
    },
    execute: async (
      {
        taskId,
        toIntent,
        reason,
        approvedByUser,
        approvalEvidence,
      }: {
        taskId: string;
        toIntent: "inline" | "separate_verification" | "not_applicable";
        reason: string;
        approvedByUser: true;
        approvalEvidence: string;
      },
      store: Store,
    ) => {
      if (!approvedByUser) {
        return formatToolOutput({
          error:
            "approvedByUser must be true. You must present the reclassification to the user and obtain explicit approval before calling this tool.",
        });
      }

      if (!approvalEvidence || approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          error:
            "approvalEvidence is required. Describe how the user approved (e.g., question tool response).",
        });
      }

      // Resolve the task to check current tdd_intent
      const taskResult = await store.tasks.show(taskId);
      if (!taskResult) {
        return formatToolOutput({
          error: `Task not found: ${taskId}`,
        });
      }

      const { task } = taskResult;

      if (task.status === "cancelled") {
        return formatToolOutput({
          error: `Task ${taskId} is cancelled. Cannot reclassify TDD intent on a cancelled task.`,
        });
      }

      const currentIntent = task.metadata?.tdd_intent;

      if (currentIntent === toIntent) {
        return formatToolOutput({
          error: `Task ${taskId} already has tdd_intent="${toIntent}". No reclassification needed.`,
        });
      }

      const now = new Date().toISOString();
      const reclassification: TddReclassification = {
        from_intent: currentIntent ?? "none",
        to_intent: toIntent,
        reason,
        approved_by_user: true,
        approval_evidence: approvalEvidence,
        approved_at: now,
      };

      const updated = await store.tasks.reclassifyTdd(taskId, reclassification);
      if (!updated) {
        return formatToolOutput({
          error: `Failed to reclassify task ${taskId}. Task may have been removed.`,
        });
      }

      return formatToolOutput({
        success: true,
        task: updated,
        message: `Reclassified tdd_intent from "${currentIntent}" to "${toIntent}" with user approval.`,
      });
    },
  },
};
