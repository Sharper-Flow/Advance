/**
 * Agenda Tools
 *
 * MCP tools for lightweight task management without full spec ceremony.
 * Agenda MCP surface is intentionally small: list/add/start/complete/cancel/prioritize.
 */

import { z } from "zod";
import {
  loadAgenda,
  addAgendaItem,
  startAgendaItem,
  completeAgendaItem,
  cancelAgendaItem,
  reprioritizeAgendaItem,
} from "../storage/agenda";
import {
  AgendaPrioritySchema,
  AgendaStatusSchema,
  isLogicTask,
  getIncompleteGates,
  allGatesSatisfied,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";

// =============================================================================
// Tool Definitions
// =============================================================================

export const agendaTools = {
  adv_agenda_list: {
    description:
      "List all agenda items, optionally filtered by status. Shows current work queue.",
    args: {
      status: AgendaStatusSchema.optional().describe(
        "Filter by status (pending, active, blocked, done, cancelled)",
      ),
      includeCompleted: z
        .boolean()
        .optional()
        .describe("Include done/cancelled items (default: false)"),
    },
    execute: async (
      {
        status,
        includeCompleted,
      }: { status?: string; includeCompleted?: boolean },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const { items } = await loadAgenda(projectDir, { agendaPath });

      let filtered = items;
      if (status) {
        filtered = items.filter((i) => i.status === status);
      } else if (!includeCompleted) {
        filtered = items.filter(
          (i) => i.status !== "done" && i.status !== "cancelled",
        );
      }

      return formatToolOutput({
        count: filtered.length,
        items: filtered.map((i) => ({
          id: i.id,
          title: i.title,
          priority: i.priority,
          status: i.status,
          category: i.category,
          blocked_by: i.blocked_by,
        })),
      });
    },
  },

  adv_agenda_add: {
    description:
      "Add a new task to the agenda. Use for quick work items that don't need full spec ceremony.",
    args: {
      title: z.string().describe("Task description"),
      description: z
        .string()
        .optional()
        .describe("Detailed description or acceptance criteria"),
      priority: AgendaPrioritySchema.optional().describe(
        "Priority level (critical, high, medium, low, backlog)",
      ),
      category: z
        .string()
        .optional()
        .describe("Category tag (e.g., tests, bugfix, refactor, feature)"),
      blocked_by: z
        .string()
        .optional()
        .describe("ID of agenda item that blocks this one"),
    },
    execute: async (
      {
        title,
        description,
        priority,
        category,
        blocked_by,
      }: {
        title: string;
        description?: string;
        priority?: "critical" | "high" | "medium" | "low" | "backlog";
        category?: string;
        blocked_by?: string;
      },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const item = await addAgendaItem(projectDir, title, {
        description,
        priority,
        category,
        blocked_by,
        agendaPath,
      });

      const requiresTdd = isLogicTask(title);

      return formatToolOutput({
        success: true,
        item,
        analysis: {
          requires_tdd: requiresTdd,
          recommendation: requiresTdd
            ? "This task appears logic-heavy. Consider TDD workflow."
            : "Task added. Ready to start when prioritized.",
        },
      });
    },
  },

  adv_agenda_start: {
    description: "Start working on an agenda item. Marks it as active.",
    args: {
      itemId: z.string().describe("Agenda item ID"),
    },
    execute: async (
      { itemId }: { itemId: string },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const item = await startAgendaItem(projectDir, itemId, { agendaPath });
      if (!item) {
        return formatToolOutput({ error: `Agenda item not found: ${itemId}` });
      }
      return formatToolOutput({ success: true, item });
    },
  },

  adv_agenda_complete: {
    description: "Mark an agenda item as complete with optional notes.",
    args: {
      itemId: z.string().describe("Agenda item ID"),
      notes: z.string().optional().describe("Completion notes or evidence"),
    },
    execute: async (
      { itemId, notes }: { itemId: string; notes?: string },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const { items } = await loadAgenda(projectDir, { agendaPath });
      const existing = items.find((i) => i.id === itemId);

      if (!existing) {
        return formatToolOutput({ error: `Agenda item not found: ${itemId}` });
      }

      // Check gates if present (agenda items can optionally use 7-gate quality checklist)
      if (existing.gates) {
        const gates = existing.gates;
        if (!allGatesSatisfied(gates)) {
          const incompleteGates = getIncompleteGates(gates);
          return formatToolOutput({
            error:
              "Cannot complete: incomplete gates. Complete all required quality gates before marking done.",
            incompleteGates,
            hint: `Complete gates with adv_gate_complete for each: ${incompleteGates.join(", ")}`,
          });
        }
      }

      const item = await completeAgendaItem(projectDir, itemId, notes, {
        agendaPath,
      });
      return formatToolOutput({ success: true, item });
    },
  },

  adv_agenda_cancel: {
    description: "Cancel an agenda item with optional reason.",
    args: {
      itemId: z.string().describe("Agenda item ID"),
      reason: z.string().optional().describe("Cancellation reason"),
    },
    execute: async (
      { itemId, reason }: { itemId: string; reason?: string },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const item = await cancelAgendaItem(projectDir, itemId, reason, {
        agendaPath,
      });
      if (!item) {
        return formatToolOutput({ error: `Agenda item not found: ${itemId}` });
      }
      return formatToolOutput({ success: true, item });
    },
  },

  adv_agenda_prioritize: {
    description: "Change the priority of an agenda item.",
    args: {
      itemId: z.string().describe("Agenda item ID"),
      priority: AgendaPrioritySchema.describe(
        "New priority (critical, high, medium, low, backlog)",
      ),
    },
    execute: async (
      {
        itemId,
        priority,
      }: {
        itemId: string;
        priority: "critical" | "high" | "medium" | "low" | "backlog";
      },
      projectDir: string,
      agendaPath?: string,
    ) => {
      const item = await reprioritizeAgendaItem(projectDir, itemId, priority, {
        agendaPath,
      });
      if (!item) {
        return formatToolOutput({ error: `Agenda item not found: ${itemId}` });
      }
      return formatToolOutput({ success: true, item });
    },
  },
};
