/**
 * Agenda Tools
 *
 * MCP tools for lightweight task management without full spec ceremony.
 * Most are data tools (pure JSON), except adv_agenda_next and adv_agenda_stats which are user-facing.
 */

import { z } from "zod";
import {
  loadAgenda,
  addAgendaItem,
  updateAgendaItem,
  startAgendaItem,
  completeAgendaItem,
  cancelAgendaItem,
  reprioritizeAgendaItem,
  getActiveAgenda,
  getNextAgendaItem,
  getAgendaStats,
  compactAgenda,
} from "../storage/agenda";
import {
  AgendaPrioritySchema,
  AgendaStatusSchema,
  getTddComplianceStatus,
  isLogicTask,
  type TddPhaseEvidence,
  getIncompleteGates,
  allGatesSatisfied,
} from "../types";
import { wrapWithBanner } from "../utils/banner";

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
    ) => {
      const { items } = await loadAgenda(projectDir);

      let filtered = items;
      if (status) {
        filtered = items.filter((i) => i.status === status);
      } else if (!includeCompleted) {
        filtered = items.filter(
          (i) => i.status !== "done" && i.status !== "cancelled",
        );
      }

      return JSON.stringify(
        {
          count: filtered.length,
          items: filtered.map((i) => ({
            id: i.id,
            title: i.title,
            priority: i.priority,
            status: i.status,
            category: i.category,
            blocked_by: i.blocked_by,
            tdd_phase: i.tdd_phase,
          })),
        },
        null,
        2,
      );
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
    ) => {
      const item = await addAgendaItem(projectDir, title, {
        description,
        priority,
        category,
        blocked_by,
      });

      const requiresTdd = isLogicTask(title);

      return JSON.stringify(
        {
          success: true,
          item,
          analysis: {
            requires_tdd: requiresTdd,
            recommendation: requiresTdd
              ? "This task appears logic-heavy. Consider TDD workflow."
              : "Task added. Ready to start when prioritized.",
          },
        },
        null,
        2,
      );
    },
  },

  adv_agenda_start: {
    description: "Start working on an agenda item. Marks it as active.",
    args: {
      itemId: z.string().describe("Agenda item ID"),
    },
    execute: async ({ itemId }: { itemId: string }, projectDir: string) => {
      const item = await startAgendaItem(projectDir, itemId);
      if (!item) {
        return JSON.stringify({ error: `Agenda item not found: ${itemId}` });
      }
      return JSON.stringify({ success: true, item }, null, 2);
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
    ) => {
      const { items } = await loadAgenda(projectDir);
      const existing = items.find((i) => i.id === itemId);

      if (!existing) {
        return JSON.stringify({ error: `Agenda item not found: ${itemId}` });
      }

      // Check gates if present (agenda items can optionally use 6-gate quality checklist)
      if (existing.gates) {
        const gates = existing.gates;
        if (!allGatesSatisfied(gates)) {
          const incompleteGates = getIncompleteGates(gates);
          return JSON.stringify({
            error:
              "Cannot complete: incomplete gates. Complete all 6 quality gates before marking done.",
            incompleteGates,
            hint: `Complete gates with adv_gate_complete for each: ${incompleteGates.join(", ")}`,
          });
        }
      }

      const compliance = getTddComplianceStatus({
        ...existing,
        id: existing.id,
        title: existing.title,
        status: "done",
        priority: 0,
        created_at: existing.created_at,
        tdd_phase: existing.tdd_phase,
        tdd_evidence: existing.tdd_evidence,
      });

      if (compliance === "missing") {
        return JSON.stringify(
          {
            warning: "TDD evidence missing for logic-heavy task",
            item: existing,
            compliance,
            recommendation:
              "Record TDD evidence with adv_agenda_evidence or complete with --force",
          },
          null,
          2,
        );
      }

      const item = await completeAgendaItem(projectDir, itemId, notes);
      return JSON.stringify({ success: true, item, compliance }, null, 2);
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
    ) => {
      const item = await cancelAgendaItem(projectDir, itemId, reason);
      if (!item) {
        return JSON.stringify({ error: `Agenda item not found: ${itemId}` });
      }
      return JSON.stringify({ success: true, item }, null, 2);
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
    ) => {
      const item = await reprioritizeAgendaItem(projectDir, itemId, priority);
      if (!item) {
        return JSON.stringify({ error: `Agenda item not found: ${itemId}` });
      }
      return JSON.stringify({ success: true, item }, null, 2);
    },
  },

  adv_agenda_next: {
    description:
      "Get the next agenda item to work on (highest priority unblocked item).",
    args: {},
    execute: async (_args: Record<string, never>, projectDir: string) => {
      const item = await getNextAgendaItem(projectDir);
      if (!item) {
        return wrapWithBanner(
          { command: "adv_agenda_next" },
          JSON.stringify({
            message: "No pending items in agenda",
            suggestion: "Add items with adv_agenda_add",
          }),
        );
      }

      const requiresTdd = isLogicTask(item.title);

      return wrapWithBanner(
        { command: "adv_agenda_next", target: item.id },
        JSON.stringify(
          {
            next: item,
            analysis: {
              requires_tdd: requiresTdd,
              recommendation: requiresTdd
                ? "Start with a failing test (Red phase)"
                : "Ready to implement",
            },
          },
          null,
          2,
        ),
      );
    },
  },

  adv_agenda_stats: {
    description: "Get statistics about the current agenda.",
    args: {},
    execute: async (_args: Record<string, never>, projectDir: string) => {
      const stats = await getAgendaStats(projectDir);
      const active = await getActiveAgenda(projectDir);

      return wrapWithBanner(
        { command: "adv_agenda_stats" },
        JSON.stringify(
          {
            ...stats,
            activeQueue: active.length,
            nextUp:
              active.length > 0
                ? { id: active[0].id, title: active[0].title }
                : null,
          },
          null,
          2,
        ),
      );
    },
  },

  adv_agenda_evidence: {
    description:
      "Record TDD evidence for an agenda item (red/green phase proof).",
    args: {
      itemId: z.string().describe("Agenda item ID"),
      phase: z.enum(["red", "green"]).describe("TDD phase"),
      testFile: z.string().optional().describe("Test file path"),
      command: z.string().optional().describe("Test command run"),
      output: z
        .string()
        .optional()
        .describe("Test output (will be truncated to 500 chars)"),
      exitCode: z
        .number()
        .optional()
        .describe("Exit code (0=pass, non-zero=fail)"),
    },
    execute: async (
      {
        itemId,
        phase,
        testFile,
        command,
        output,
        exitCode,
      }: {
        itemId: string;
        phase: "red" | "green";
        testFile?: string;
        command?: string;
        output?: string;
        exitCode?: number;
      },
      projectDir: string,
    ) => {
      const { items } = await loadAgenda(projectDir);
      const existing = items.find((i) => i.id === itemId);

      if (!existing) {
        return JSON.stringify({ error: `Agenda item not found: ${itemId}` });
      }

      const evidence: TddPhaseEvidence = {
        test_file: testFile,
        command,
        output_snippet: output?.slice(0, 500),
        exit_code: exitCode,
        recorded_at: new Date().toISOString(),
      };

      const tddEvidence = existing.tdd_evidence ?? {};
      tddEvidence[phase] = evidence;

      let tddPhase: "none" | "red" | "green" | "refactor" | "complete" =
        existing.tdd_phase;
      if (phase === "red") {
        tddPhase = "red";
      } else if (phase === "green") {
        tddPhase = tddEvidence.red?.recorded_at ? "complete" : "green";
      }

      const updated = await updateAgendaItem(projectDir, itemId, {
        tdd_evidence: tddEvidence,
        tdd_phase: tddPhase,
      });

      return JSON.stringify(
        {
          success: true,
          item: updated,
          message: `Recorded ${phase} phase evidence`,
        },
        null,
        2,
      );
    },
  },

  adv_agenda_compact: {
    description:
      "Compact the agenda file by removing superseded entries. Run periodically to keep file size manageable.",
    args: {},
    execute: async (_args: Record<string, never>, projectDir: string) => {
      await compactAgenda(projectDir);
      const stats = await getAgendaStats(projectDir);

      return JSON.stringify(
        {
          success: true,
          message: "Agenda compacted",
          items: stats.total,
        },
        null,
        2,
      );
    },
  },
};
