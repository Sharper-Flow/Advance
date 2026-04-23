/**
 * Agenda Tools
 *
 * MCP tools for lightweight task management without full spec ceremony.
 * Agenda MCP surface is intentionally small: list/add/start/complete/cancel/prioritize/evidence.
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
} from "../storage/agenda";
import { addAgendaItemUpdate, projectAgendaQuery } from "../temporal/messages";
import { writeJsonlAtomic } from "../storage/jsonl-atomic-writer";
import {
  AgendaPrioritySchema,
  AgendaStatusSchema,
  getTddComplianceStatus,
  isLogicTask,
  type TddPhaseEvidence,
  getIncompleteGates,
  allGatesSatisfied,
} from "../types";
import { formatToolOutput } from "../utils/tool-output";
import { getBoundedProjectWorkflowAccess } from "./project-workflow-helper";

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
          tdd_phase: i.tdd_phase,
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
      let item;
      let derivedExportWarning: string | undefined;
      try {
        const temporal = await getBoundedProjectWorkflowAccess({
          projectDir,
          mutablePath: agendaPath,
        });

        if (temporal.mode === "local-only") {
          throw new Error("Project workflow unavailable");
        }

        if (temporal.mode === "unavailable") {
          return formatToolOutput({
            error: `Project workflow unavailable: ${temporal.reason}`,
          });
        }

        let temporalMutationCommitted = false;
        item = await temporal.handle.executeUpdate(addAgendaItemUpdate, {
          args: [
            {
              title,
              description,
              priority,
              category,
              blocked_by,
            },
          ],
        });
        temporalMutationCommitted = true;

        try {
          const agenda = await temporal.handle.query(
            projectAgendaQuery,
            undefined,
          );
          await writeJsonlAtomic(agendaPath!, agenda as readonly unknown[]);
        } catch (error) {
          if (temporalMutationCommitted) {
            derivedExportWarning =
              error instanceof Error
                ? `Workflow state updated but derived agenda.jsonl write failed: ${error.message}`
                : "Workflow state updated but derived agenda.jsonl write failed";
          } else {
            throw error;
          }
        } finally {
          await temporal.bundle.connection.close().catch(() => undefined);
        }
      } catch {
        item = await addAgendaItem(projectDir, title, {
          description,
          priority,
          category,
          blocked_by,
          agendaPath,
        });
      }

      const requiresTdd = isLogicTask(title);

      return formatToolOutput({
        success: true,
        item,
        ...(derivedExportWarning ? { warning: derivedExportWarning } : {}),
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

      const compliance = getTddComplianceStatus({
        ...existing,
        id: existing.id,
        title: existing.title,
        type: "code" as const,
        status: "done",
        priority: 0,
        created_at: existing.created_at,
        tdd_phase: existing.tdd_phase,
        tdd_evidence: existing.tdd_evidence,
      });

      if (compliance === "missing") {
        return formatToolOutput({
          warning: "TDD evidence missing for logic-heavy task",
          item: existing,
          compliance,
          recommendation:
            "Record TDD evidence with adv_agenda_evidence or complete with --force",
        });
      }

      const item = await completeAgendaItem(projectDir, itemId, notes, {
        agendaPath,
      });
      return formatToolOutput({ success: true, item, compliance });
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
      agendaPath?: string,
    ) => {
      const { items } = await loadAgenda(projectDir, { agendaPath });
      const existing = items.find((i) => i.id === itemId);

      if (!existing) {
        return formatToolOutput({ error: `Agenda item not found: ${itemId}` });
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

      const updated = await updateAgendaItem(
        projectDir,
        itemId,
        {
          tdd_evidence: tddEvidence,
          tdd_phase: tddPhase,
        },
        { agendaPath },
      );

      return formatToolOutput({
        success: true,
        item: updated,
        message: `Recorded ${phase} phase evidence`,
      });
    },
  },
};
