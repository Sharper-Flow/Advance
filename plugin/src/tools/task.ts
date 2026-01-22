/**
 * Task Tools
 *
 * Tools for managing tasks within changes.
 */

import { z } from "zod";
import type { Store } from "../storage/store";

// =============================================================================
// Tool Definitions
// =============================================================================

export const taskTools = {
  adv_task_list: {
    description: "List tasks for a change with optional status filter",
    args: {
      changeId: z.string().describe("Change ID"),
      status: z
        .enum(["pending", "in_progress", "done", "cancelled"])
        .optional()
        .describe("Filter by status"),
    },
    execute: async (
      { changeId, status }: { changeId: string; status?: string },
      store: Store,
    ) => {
      const tasks = await store.tasks.list(changeId, status);
      return JSON.stringify({ tasks }, null, 2);
    },
  },

  adv_task_ready: {
    description: "Get unblocked pending tasks ready for work",
    args: {
      changeId: z.string().describe("Change ID"),
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      const result = await store.tasks.ready(changeId);
      return JSON.stringify(result, null, 2);
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
        return JSON.stringify({ error: `Task not found: ${taskId}` });
      }
      return JSON.stringify({ success: true, task }, null, 2);
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
        return JSON.stringify({ taskId: task.id, task }, null, 2);
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : "Failed to add task",
        });
      }
    },
  },
};
