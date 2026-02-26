/**
 * Task Tools
 *
 * Tools for managing tasks within changes.
 * All are data tools returning pure JSON.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import {
  getTddComplianceStatus,
  isLogicTask,
  isTrivialTask,
  truncateOutput,
  type Cancellation,
} from "../types";
import { formatToolOutput, paginate } from "../utils/tool-output";

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
      return formatToolOutput({ task: result.task, changeId: result.changeId });
    },
  },

  adv_task_list: {
    description: "List tasks for a change with optional status filter",
    args: {
      changeId: z.string().describe("Change ID"),
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
      changeId: z.string().describe("Change ID"),
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      const result = await store.tasks.ready(changeId);
      return formatToolOutput(result);
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
    },
    execute: async (
      {
        taskId,
        status,
        notes,
      }: { taskId: string; status: string; notes?: string },
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

      const task = await store.tasks.update(taskId, status, notes);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }
      return formatToolOutput({ success: true, task });
    },
  },

  adv_task_add: {
    description: "Add a new task to a change",
    args: {
      changeId: z.string().describe("Change ID"),
      content: z.string().describe("Task description"),
      blockedBy: z
        .array(z.string())
        .optional()
        .describe("Task IDs that block this task"),
      section: z
        .string()
        .optional()
        .describe("Section header (e.g., 'Testing')"),
    },
    execute: async (
      {
        changeId,
        content,
        blockedBy,
        section,
      }: {
        changeId: string;
        content: string;
        blockedBy?: string[];
        section?: string;
      },
      store: Store,
    ) => {
      try {
        const task = await store.tasks.add(changeId, content, {
          blockedBy,
          section,
        });
        return formatToolOutput({ taskId: task.id, task });
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
        .describe("Test output (will be truncated to 500 chars)"),
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
      const evidence = {
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
        compliance: getTddComplianceStatus(task),
        message: `Recorded ${phase} phase evidence for task ${taskId}`,
      });
    },
  },

  adv_task_tdd_phase: {
    description:
      "Manually set the TDD phase for a task (use adv_task_evidence to record with proof)",
    args: {
      taskId: z.string().describe("Task ID"),
      phase: z
        .enum(["none", "red", "green", "refactor", "complete"])
        .describe("TDD phase to set"),
    },
    execute: async (
      {
        taskId,
        phase,
      }: {
        taskId: string;
        phase: "none" | "red" | "green" | "refactor" | "complete";
      },
      store: Store,
    ) => {
      const task = await store.tasks.setPhase(taskId, phase);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      return formatToolOutput({
        success: true,
        task,
        message: `Set TDD phase to '${phase}' for task ${taskId}`,
      });
    },
  },

  adv_task_skip_tdd: {
    description:
      "Skip TDD for a task with a documented reason (e.g., 'trivial: docs change', 'legacy: existing code')",
    args: {
      taskId: z.string().describe("Task ID"),
      reason: z
        .string()
        .describe(
          "Rationale for skipping TDD (e.g., 'trivial: config change')",
        ),
    },
    execute: async (
      { taskId, reason }: { taskId: string; reason: string },
      store: Store,
    ) => {
      const task = await store.tasks.skipTdd(taskId, reason);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      return formatToolOutput({
        success: true,
        task,
        compliance: getTddComplianceStatus(task),
        message: `TDD skipped for task ${taskId}: ${reason}`,
      });
    },
  },

  adv_task_tdd_status: {
    description:
      "Get TDD compliance status for a task (analyzes task title to determine if TDD is required)",
    args: {
      taskId: z.string().describe("Task ID"),
    },
    execute: async ({ taskId }: { taskId: string }, store: Store) => {
      const task = await store.tasks.get(taskId);
      if (!task) {
        return formatToolOutput({ error: `Task not found: ${taskId}` });
      }

      const compliance = getTddComplianceStatus(task);
      const requiresTdd = isLogicTask(task.title);
      const trivial = isTrivialTask(task.title);

      return formatToolOutput({
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
            ? "Record TDD evidence with adv_task_evidence or skip with adv_task_skip_tdd"
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
        .describe("Task IDs to cancel (batch supported)"),
      reasons: z
        .record(z.string())
        .describe(
          "Per-task cancellation reasons keyed by task ID (e.g., { 'tk-abc': 'Absorbed into tk-xyz' })",
        ),
      approvedByUser: z
        .literal(true)
        .describe("Must be true — confirms user explicitly approved"),
      approvalEvidence: z
        .string()
        .describe(
          "Evidence of user approval (e.g., 'User approved via question tool: selected Approve cancellations')",
        ),
      supersededBy: z
        .record(z.string())
        .optional()
        .describe(
          "Optional per-task superseding task ID (e.g., { 'tk-abc': 'tk-xyz' })",
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
      return formatToolOutput({
        success: allSuccess,
        cancelled: cancelledTasks,
        results,
        message: allSuccess
          ? `Cancelled ${cancelledTasks.length} task(s) with user approval.`
          : `Partial cancellation: ${results.filter((r) => r.success).length}/${taskIds.length} succeeded.`,
      });
    },
  },
};
