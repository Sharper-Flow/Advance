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
      { changeId, status, limit, offset }: { changeId: string; status?: string; limit?: number; offset?: number },
      store: Store,
    ) => {
      const tasks = await store.tasks.list(changeId, status);
      const paged = paginate(tasks, {
        limit,
        offset,
        tool: "adv_task_list",
        args: `changeId: "${changeId}"${status ? `, status: "${status}"` : ""}`,
      });
      return formatToolOutput({ tasks: paged.items, pagination: paged.pagination });
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
    description: "Update task status",
    args: {
      taskId: z.string().describe("Task ID"),
      status: z
        .enum(["pending", "in_progress", "done", "cancelled"])
        .describe("New status"),
      notes: z
        .string()
        .optional()
        .describe("Completion notes or cancellation reason"),
    },
    execute: async (
      {
        taskId,
        status,
        notes,
      }: { taskId: string; status: string; notes?: string },
      store: Store,
    ) => {
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
};
