/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: 30 MCP tools for spec/change/task/wisdom management
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: TDD phase detection, test runner tracking
 * - experimental.session.compacting: Change preservation during compaction
 */

import { type Plugin, tool } from "@opencode-ai/plugin";
import { createStore } from "./storage/store";
import { specTools } from "./tools/spec";
import { changeTools } from "./tools/change";
import { taskTools } from "./tools/task";
import { wisdomTools } from "./tools/wisdom";
import { statusTools } from "./tools/status";
import { agendaTools } from "./tools/agenda";
import { projectTools } from "./tools/project";
import { gateTools } from "./tools/gate";
import {
  initializeStatus,
  cleanup as cleanupTerminal,
  getProjectName,
  setStatus,
  setActiveChange,
  pruneStaleRetries,
} from "./events";
import type { StatusMarker } from "./types";
import { safeExecute, safeExecuteSimple } from "./utils/safe-execute";
import { listProjectWisdom } from "./storage/project-wisdom";
import { getProjectId, getExternalRoot } from "./utils/project-id";
import { migrateToExternalState } from "./storage/migrate";
import { consumeHandoff } from "./storage/handoff";

// =============================================================================
// Types
// =============================================================================

/** Plugin state for tracking active work */
interface PluginState {
  status: StatusMarker;
  activeSubAgents: number;
  lastBashCommand: string | null;
  activeChange: {
    id: string | null;
    objective: string | null;
  };
  lastCompletedTask: {
    id: string;
    title: string;
  } | null;
  /** True when running inside a git worktree (directory !== main repo root) */
  isWorktree: boolean;
}

// =============================================================================
// Debug Logging
// =============================================================================

import * as fs from "fs";

const DEBUG = process.env.ADV_DEBUG === "1";

const debugLog = (msg: string): void => {
  if (DEBUG) {
    try {
      fs.appendFileSync(
        "/tmp/adv-debug.log",
        `${new Date().toISOString()} [index] ${msg}\n`,
      );
    } catch {
      // ignore
    }
  }
};

// =============================================================================
// Constants
// =============================================================================

/** Patterns indicating a test runner command */
const TEST_RUNNER_PATTERNS = [
  /\bvitest\b/,
  /\bjest\b/,
  /\bmocha\b/,
  /\bpytest\b/,
  /\bnpm\s+test\b/,
  /\bpnpm\s+test\b/,
  /\byarn\s+test\b/,
  /\bbun\s+test\b/,
  /\buv\s+run\s+pytest\b/,
];

/** Patterns indicating test failure in output (used as fallback when exitCode is unavailable).
 *  Anchored to test-runner-specific output to reduce false positives from
 *  general log output containing "Error:" or "FAIL" substrings. */
const TEST_FAILURE_PATTERNS =
  /\bFAILED\b|Tests?\s+Failed|Test Suites?:.*failed|FAIL\s+(?:src\/|test\/|\.\/)|AssertionError|AssertError|✗|✘|(?:^|\n)\s*\d+\s+(?:failing|failed)\b/;

// =============================================================================
// Plugin Export
// =============================================================================

export const AdvancePlugin: Plugin = async ({ directory, worktree }) => {
  const isWorktree = !!worktree && worktree !== directory;
  debugLog(
    `Plugin initializing: directory=${directory}, worktree=${worktree}, isWorktree=${isWorktree}`,
  );

  // Derive project identity and resolve external state directory
  const projectId = await getProjectId(directory);
  let externalRoot: string | undefined;

  if (projectId) {
    externalRoot = getExternalRoot(projectId);
    debugLog(
      `External state: projectId=${projectId}, externalRoot=${externalRoot}`,
    );

    // One-time migration: copy any existing .adv/ mutable state to external dir
    try {
      const report = await migrateToExternalState(directory, externalRoot);
      if (report.migrated.length > 0) {
        debugLog(
          `Migration completed: migrated=${report.migrated.join(",")}, skipped=${report.skipped.join(",")}`,
        );
      }
    } catch (e) {
      debugLog(`Migration failed (non-fatal): ${(e as Error).message}`);
      // Migration failure is non-fatal — external dir may not be writable in some envs
    }
  } else {
    debugLog("No project ID (not a git repo?) — using legacy in-repo paths");
  }

  // Initialize store (lazy sync - don't call store.sync() here)
  // Sync happens on-demand when tools access specs/changes
  const store = await createStore(directory, { externalRoot });
  await store.init();
  // Sync happens on-demand via store.sync() when tools access specs/changes

  // Initialize terminal status
  const projectName = getProjectName(directory);
  debugLog(`Initializing status: projectName=${projectName}`);
  initializeStatus(projectName);

  // Plugin state
  const state: PluginState = {
    status: "EARTH",
    activeSubAgents: 0,
    lastBashCommand: null,
    activeChange: {
      id: null,
      objective: null,
    },
    lastCompletedTask: null,
    isWorktree,
  };

  // Session hydration: atomically consume handoff.json and populate active change
  if (store.paths.external) {
    try {
      const handoff = await consumeHandoff(store.paths.handoff);
      if (handoff) {
        state.activeChange = {
          id: handoff.changeId,
          objective: handoff.objective,
        };
        setActiveChange(handoff.changeId);
        debugLog(
          `Hydrated from handoff: changeId=${handoff.changeId}, objective=${handoff.objective}`,
        );
      }
    } catch (e) {
      debugLog(`Handoff hydration failed (non-fatal): ${(e as Error).message}`);
    }
  }

  // Helper to update state and terminal
  const setState = (updates: Partial<PluginState>) => {
    Object.assign(state, updates);
    if (updates.status) {
      setStatus(updates.status);
    }
  };

  // Register cleanup handlers (store references for removal)
  const handleExit = () => {
    cleanupTerminal();
    try {
      store.close();
    } catch {
      // Ignore errors during exit
    }
  };
  const handleSigInt = () => {
    cleanupTerminal();
    try {
      store.close();
    } catch {
      // Ignore errors during signal handling
    }
    process.exit(0);
  };
  const handleSigTerm = () => {
    cleanupTerminal();
    try {
      store.close();
    } catch {
      // Ignore errors during signal handling
    }
    process.exit(0);
  };
  process.on("exit", handleExit);
  process.on("SIGINT", handleSigInt);
  process.on("SIGTERM", handleSigTerm);

  // Remove listeners on session.deleted to prevent memory leaks
  const removeProcessListeners = () => {
    process.removeListener("exit", handleExit);
    process.removeListener("SIGINT", handleSigInt);
    process.removeListener("SIGTERM", handleSigTerm);
  };

  // ==========================================================================
  // Return Hooks
  // ==========================================================================

  return {
    // ========================================================================
    // MCP Tools
    // ========================================================================
    tool: {
      // ----------------------------------------------------------------------
      // Spec Tools
      // ----------------------------------------------------------------------
      adv_spec_list: tool({
        description: specTools.adv_spec_list.description,
        args: {
          capability: tool.schema
            .string()
            .optional()
            .describe("Filter by capability name"),
          tag: tool.schema.string().optional().describe("Filter by tag"),
        },
        execute: safeExecute(
          async (args) => specTools.adv_spec_list.execute(args, store),
          "adv_spec_list",
        ),
      }),

      adv_spec_show: tool({
        description: specTools.adv_spec_show.description,
        args: {
          capability: tool.schema
            .string()
            .describe("Capability ID (e.g., 'contract-system')"),
        },
        execute: safeExecute(
          async (args) => specTools.adv_spec_show.execute(args, store),
          "adv_spec_show",
        ),
      }),

      adv_spec_search: tool({
        description: specTools.adv_spec_search.description,
        args: {
          query: tool.schema.string().describe("Search query"),
          limit: tool.schema
            .number()
            .optional()
            .describe("Maximum results (default: 20)"),
        },
        execute: safeExecute(
          async (args) => specTools.adv_spec_search.execute(args, store),
          "adv_spec_search",
        ),
      }),

      // ----------------------------------------------------------------------
      // Change Tools
      // ----------------------------------------------------------------------
      adv_change_list: tool({
        description: changeTools.adv_change_list.description,
        args: {
          status: tool.schema
            .string()
            .optional()
            .describe("Filter by status (draft, pending, active, archived)"),
          includeArchived: tool.schema
            .boolean()
            .optional()
            .describe("Include archived changes"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_list.execute(args, store),
          "adv_change_list",
        ),
      }),

      adv_change_show: tool({
        description: changeTools.adv_change_show.description,
        args: {
          changeId: tool.schema.string().describe("Change ID to show"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_show.execute(args, store),
          "adv_change_show",
        ),
      }),

      adv_change_create: tool({
        description: changeTools.adv_change_create.description,
        args: {
          summary: tool.schema.string().describe("Brief summary of the change"),
          capability: tool.schema
            .string()
            .optional()
            .describe("Target capability"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_create.execute(args, store),
          "adv_change_create",
        ),
      }),

      adv_change_validate: tool({
        description: changeTools.adv_change_validate.description,
        args: {
          changeId: tool.schema.string().describe("Change ID to validate"),
          strict: tool.schema
            .boolean()
            .optional()
            .describe("Enable strict validation"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_validate.execute(args, store),
          "adv_change_validate",
        ),
      }),

      adv_change_archive: tool({
        description: changeTools.adv_change_archive.description,
        args: {
          changeId: tool.schema.string().describe("Change ID to archive"),
          dryRun: tool.schema
            .boolean()
            .optional()
            .describe("Preview without archiving"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_archive.execute(args, store),
          "adv_change_archive",
        ),
      }),

      adv_change_add_issue: tool({
        description: changeTools.adv_change_add_issue.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
          issueUrl: tool.schema.string().describe("GitHub issue URL to add"),
        },
        execute: safeExecute(
          async (args) => changeTools.adv_change_add_issue.execute(args, store),
          "adv_change_add_issue",
        ),
      }),

      adv_change_remove_issue: tool({
        description: changeTools.adv_change_remove_issue.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
          issueUrl: tool.schema.string().describe("GitHub issue URL to remove"),
        },
        execute: safeExecute(
          async (args) =>
            changeTools.adv_change_remove_issue.execute(args, store),
          "adv_change_remove_issue",
        ),
      }),

      // ----------------------------------------------------------------------
      // Task Tools
      // ----------------------------------------------------------------------
      adv_task_show: tool({
        description: taskTools.adv_task_show.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_show.execute(args, store),
          "adv_task_show",
        ),
      }),

      adv_task_list: tool({
        description: taskTools.adv_task_list.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
          status: tool.schema
            .enum(["pending", "in_progress", "done", "cancelled"])
            .optional()
            .describe("Filter by status"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_list.execute(args, store),
          "adv_task_list",
        ),
      }),

      adv_task_ready: tool({
        description: taskTools.adv_task_ready.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_ready.execute(args, store),
          "adv_task_ready",
        ),
      }),

      adv_task_update: tool({
        description: taskTools.adv_task_update.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
          status: tool.schema
            .enum(["pending", "in_progress", "done", "cancelled"])
            .describe(
              "New status. NOTE: 'cancelled' is rejected here — use adv_task_cancel instead",
            ),
          notes: tool.schema
            .string()
            .optional()
            .describe("Completion notes"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_update.execute(args, store),
          "adv_task_update",
        ),
      }),

      adv_task_add: tool({
        description: taskTools.adv_task_add.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
          content: tool.schema.string().describe("Task description"),
          blockedBy: tool.schema
            .array(tool.schema.string())
            .optional()
            .describe("Task IDs that block this task"),
          section: tool.schema
            .string()
            .optional()
            .describe("Section header (e.g., 'Testing')"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_add.execute(args, store),
          "adv_task_add",
        ),
      }),

      adv_task_evidence: tool({
        description: taskTools.adv_task_evidence.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
          phase: tool.schema
            .enum(["red", "green"])
            .describe("TDD phase (red=failing test, green=passing test)"),
          testFile: tool.schema
            .string()
            .optional()
            .describe("Test file or test name"),
          command: tool.schema
            .string()
            .optional()
            .describe("Command used to run the test"),
          output: tool.schema
            .string()
            .optional()
            .describe("Test output (will be truncated)"),
          exitCode: tool.schema
            .number()
            .optional()
            .describe("Exit code from test runner"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_evidence.execute(args, store),
          "adv_task_evidence",
        ),
      }),

      adv_task_tdd_phase: tool({
        description: taskTools.adv_task_tdd_phase.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
          phase: tool.schema
            .enum(["none", "red", "green", "refactor", "complete"])
            .describe("TDD phase to set"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_tdd_phase.execute(args, store),
          "adv_task_tdd_phase",
        ),
      }),

      adv_task_skip_tdd: tool({
        description: taskTools.adv_task_skip_tdd.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
          reason: tool.schema.string().describe("Rationale for skipping TDD"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_skip_tdd.execute(args, store),
          "adv_task_skip_tdd",
        ),
      }),

      adv_task_tdd_status: tool({
        description: taskTools.adv_task_tdd_status.description,
        args: {
          taskId: tool.schema.string().describe("Task ID"),
        },
        execute: safeExecute(
          async (args) => taskTools.adv_task_tdd_status.execute(args, store),
          "adv_task_tdd_status",
        ),
      }),

      adv_task_cancel: tool({
        description: taskTools.adv_task_cancel.description,
        args: {
          taskIds: tool.schema
            .array(tool.schema.string())
            .describe("Task IDs to cancel (batch supported)"),
          reasons: tool.schema
            .record(tool.schema.string(), tool.schema.string())
            .describe(
              "Per-task cancellation reasons keyed by task ID",
            ),
          approvedByUser: tool.schema
            .literal(true)
            .describe("Must be true — confirms user explicitly approved"),
          approvalEvidence: tool.schema
            .string()
            .describe(
              "Evidence of user approval (e.g., question tool response)",
            ),
          supersededBy: tool.schema
            .record(tool.schema.string(), tool.schema.string())
            .optional()
            .describe(
              "Optional per-task superseding task ID",
            ),
        },
        execute: safeExecute(
          async (args) =>
            taskTools.adv_task_cancel.execute(
              {
                ...args,
                reasons: args.reasons as Record<string, string>,
                supersededBy: args.supersededBy as
                  | Record<string, string>
                  | undefined,
              },
              store,
            ),
          "adv_task_cancel",
        ),
      }),

      // ----------------------------------------------------------------------
      // Wisdom Tools (Cross-Task Learning)
      // ----------------------------------------------------------------------
      adv_wisdom_add: tool({
        description: wisdomTools.adv_wisdom_add.description,
        args: {
          changeId: tool.schema.string().describe("Change ID to add wisdom to"),
          type: tool.schema
            .enum(["pattern", "success", "failure", "gotcha", "convention"])
            .describe("Category of wisdom"),
          content: tool.schema
            .string()
            .describe("The learning content (max 2000 chars)"),
          sourceTask: tool.schema
            .string()
            .optional()
            .describe("Task ID that generated this wisdom"),
        },
        execute: safeExecute(
          async (args) => wisdomTools.adv_wisdom_add.execute(args, store),
          "adv_wisdom_add",
        ),
      }),

      adv_wisdom_list: tool({
        description: wisdomTools.adv_wisdom_list.description,
        args: {
          changeId: tool.schema
            .string()
            .describe("Change ID to list wisdom for"),
        },
        execute: safeExecute(
          async (args) => wisdomTools.adv_wisdom_list.execute(args, store),
          "adv_wisdom_list",
        ),
      }),

      adv_wisdom_promote: tool({
        description: wisdomTools.adv_wisdom_promote.description,
        args: {
          changeId: tool.schema
            .string()
            .describe("Change ID containing the wisdom entry"),
          wisdomId: tool.schema
            .string()
            .describe("Wisdom entry ID (ws-xxx) to promote to project level"),
        },
        execute: safeExecute(
          async (args) => wisdomTools.adv_wisdom_promote.execute(args, store),
          "adv_wisdom_promote",
        ),
      }),

      // ----------------------------------------------------------------------
      // Status Tool
      // ----------------------------------------------------------------------
      adv_status: tool({
        description: statusTools.adv_status.description,
        args: {},
        execute: safeExecute(
          async (args) => statusTools.adv_status.execute(args, store),
          "adv_status",
        ),
      }),

      // ----------------------------------------------------------------------
      // Agenda Tools
      // ----------------------------------------------------------------------
      adv_agenda_list: tool({
        description: agendaTools.adv_agenda_list.description,
        args: {
          status: tool.schema
            .enum(["pending", "active", "blocked", "done", "cancelled"])
            .optional()
            .describe("Filter by status"),
          includeCompleted: tool.schema
            .boolean()
            .optional()
            .describe("Include done/cancelled items"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_list.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_list",
        ),
      }),

      adv_agenda_add: tool({
        description: agendaTools.adv_agenda_add.description,
        args: {
          title: tool.schema.string().describe("Task description"),
          description: tool.schema
            .string()
            .optional()
            .describe("Detailed description"),
          priority: tool.schema
            .enum(["critical", "high", "medium", "low", "backlog"])
            .optional()
            .describe("Priority level"),
          category: tool.schema.string().optional().describe("Category tag"),
          blocked_by: tool.schema
            .string()
            .optional()
            .describe("ID of blocking item"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_add.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_add",
        ),
      }),

      adv_agenda_start: tool({
        description: agendaTools.adv_agenda_start.description,
        args: {
          itemId: tool.schema.string().describe("Agenda item ID"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_start.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_start",
        ),
      }),

      adv_agenda_complete: tool({
        description: agendaTools.adv_agenda_complete.description,
        args: {
          itemId: tool.schema.string().describe("Agenda item ID"),
          notes: tool.schema.string().optional().describe("Completion notes"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_complete.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_complete",
        ),
      }),

      adv_agenda_cancel: tool({
        description: agendaTools.adv_agenda_cancel.description,
        args: {
          itemId: tool.schema.string().describe("Agenda item ID"),
          reason: tool.schema
            .string()
            .optional()
            .describe("Cancellation reason"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_cancel.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_cancel",
        ),
      }),

      adv_agenda_prioritize: tool({
        description: agendaTools.adv_agenda_prioritize.description,
        args: {
          itemId: tool.schema.string().describe("Agenda item ID"),
          priority: tool.schema
            .enum(["critical", "high", "medium", "low", "backlog"])
            .describe("New priority"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_prioritize.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_prioritize",
        ),
      }),

      adv_agenda_next: tool({
        description: agendaTools.adv_agenda_next.description,
        args: {},
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_next.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_next",
        ),
      }),

      adv_agenda_stats: tool({
        description: agendaTools.adv_agenda_stats.description,
        args: {},
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_stats.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_stats",
        ),
      }),

      adv_agenda_evidence: tool({
        description: agendaTools.adv_agenda_evidence.description,
        args: {
          itemId: tool.schema.string().describe("Agenda item ID"),
          phase: tool.schema.enum(["red", "green"]).describe("TDD phase"),
          testFile: tool.schema.string().optional().describe("Test file path"),
          command: tool.schema.string().optional().describe("Test command"),
          output: tool.schema.string().optional().describe("Test output"),
          exitCode: tool.schema.number().optional().describe("Exit code"),
        },
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_evidence.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_evidence",
        ),
      }),

      adv_agenda_compact: tool({
        description: agendaTools.adv_agenda_compact.description,
        args: {},
        execute: safeExecuteSimple(
          async (args) =>
            agendaTools.adv_agenda_compact.execute(
              args,
              directory,
              store.paths.agenda,
            ),
          "adv_agenda_compact",
        ),
      }),

      // ----------------------------------------------------------------------
      // Project Tools
      // ----------------------------------------------------------------------
      adv_project_context: tool({
        description: projectTools.adv_project_context.description,
        args: {},
        execute: safeExecute(
          async (args) => projectTools.adv_project_context.execute(args, store),
          "adv_project_context",
        ),
      }),

      // ----------------------------------------------------------------------
      // Gate Tools (6-gate quality checklist)
      // ----------------------------------------------------------------------
      adv_gate_status: tool({
        description: gateTools.adv_gate_status.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
        },
        execute: safeExecute(
          async (args) => gateTools.adv_gate_status.execute(args, store),
          "adv_gate_status",
        ),
      }),

      adv_gate_complete: tool({
        description: gateTools.adv_gate_complete.description,
        args: {
          changeId: tool.schema.string().describe("Change ID"),
          gateId: tool.schema
            .enum([
              "research",
              "prep",
              "implementation",
              "review",
              "harden",
              "signoff",
            ])
            .describe("Gate to mark complete"),
          completedBy: tool.schema
            .string()
            .optional()
            .describe("Who completed the gate (default: agent)"),
        },
        execute: safeExecute(
          async (args) => gateTools.adv_gate_complete.execute(args, store),
          "adv_gate_complete",
        ),
      }),
    },

    // ========================================================================
    // Event Hook
    // ========================================================================
    event: async ({ event }): Promise<void> => {
      try {
        // Use string comparison for flexibility with SDK event types
        const eventType = event.type as string;
        debugLog(`event: type="${eventType}"`);

        if (eventType === "session.status") {
          const props = event.properties as { status?: { type?: string } };
          const statusType = props.status?.type;
          if (statusType === "idle") {
            // Don't transition to EARTH if sub-agents are still active
            // This prevents false "completion" alerts during MOON phase
            if (state.activeSubAgents === 0) {
              setState({ status: "EARTH" });
            }
            // Prune stale retry trackers on idle to prevent memory growth
            pruneStaleRetries();
          } else if (statusType === "busy") {
            // Don't override MOON status - sub-agents are still working
            if (state.activeSubAgents === 0) {
              setState({ status: "ROCKET" });
            }
          }
        } else if (eventType === "session.deleted") {
          cleanupTerminal();
          removeProcessListeners();
          // Close SQLite database to release resources
          try {
            store.close();
            debugLog("Store closed on session.deleted");
          } catch (e) {
            debugLog(`Error closing store: ${e}`);
          }
        } else if (
          eventType === "permission.updated" ||
          eventType === "permission.asked"
        ) {
          setState({ status: "MIC" });
        } else if (eventType === "permission.replied") {
          setState({ status: state.activeSubAgents > 0 ? "MOON" : "ROCKET" });
        }
      } catch {
        // Silently handle event errors to not break OpenCode
      }
    },

    // ========================================================================
    // Tool Execute Before Hook
    // ========================================================================
    "tool.execute.before": async (input, output): Promise<void> => {
      try {
        debugLog(`tool.execute.before: tool="${input.tool}"`);

        // Track bash commands for test runner detection
        if (input.tool === "bash" && output.args?.command) {
          state.lastBashCommand = String(output.args.command);
        }

        // Track changeId from ADV tools for context injection
        // (args are only available in before hook, not after)
        if (output.args?.changeId) {
          state.activeChange.id = String(output.args.changeId);
          setActiveChange(state.activeChange.id);
        }

        // Detect sub-agent spawning (Task tool)
        // OpenCode uses lowercase "task" for the built-in Task tool
        if (input.tool === "task") {
          debugLog(`Sub-agent spawned: count=${state.activeSubAgents + 1}`);
          setState({
            activeSubAgents: state.activeSubAgents + 1,
            status: "MOON",
          });
        }

        // Detect question tools (needs user input)
        // OpenCode uses lowercase "question" for the built-in Question tool
        if (input.tool === "question") {
          setState({ status: "MIC" });
        }
      } catch (e) {
        debugLog(`tool.execute.before error: ${e}`);
      }
    },

    // ========================================================================
    // Tool Execute After Hook
    // ========================================================================
    "tool.execute.after": async (input, output): Promise<void> => {
      try {
        debugLog(`tool.execute.after: tool="${input.tool}"`);

        // Note: changeId tracking moved to tool.execute.before since
        // output.args is not available in the after hook

        // Track task status changes for hooks
        if (input.tool === "adv_task_update" && output.output) {
          try {
            const result = JSON.parse(output.output);
            if (result.success && result.task) {
              const task = result.task;

              // Track completed tasks for wisdom prompt
              if (task.status === "done") {
                state.lastCompletedTask = {
                  id: task.id,
                  title: task.title,
                };
              }
            }
          } catch {
            // ignore parse errors
          }
        }

        // Check for test runner completion
        if (input.tool === "bash" && state.lastBashCommand) {
          const isTestRunner = TEST_RUNNER_PATTERNS.some((p) =>
            p.test(state.lastBashCommand!),
          );

          if (isTestRunner) {
            const exitCode =
              (output.metadata as { exitCode?: number })?.exitCode ??
              (TEST_FAILURE_PATTERNS.test(output.output) ? 1 : 0);

            setState({
              status: exitCode === 0 ? "TDD_GREEN" : "TDD_RED",
              lastBashCommand: null,
            });
            return;
          }

          state.lastBashCommand = null;
        }

        // Handle sub-agent completion
        // OpenCode uses lowercase "task" for the built-in Task tool
        if (input.tool === "task") {
          const newCount = Math.max(0, state.activeSubAgents - 1);
          debugLog(`Sub-agent completed: count=${newCount}`);
          setState({
            activeSubAgents: newCount,
            status: newCount > 0 ? "MOON" : "ROCKET",
          });
        }

        // Handle question tool completion
        if (input.tool === "question") {
          setState({ status: state.activeSubAgents > 0 ? "MOON" : "ROCKET" });
        }
      } catch (e) {
        debugLog(`tool.execute.after error: ${e}`);
      }
    },

    // ========================================================================
    // Context Injection Hook (Continuation & Wisdom)
    // ========================================================================
    "experimental.chat.system.transform": async (
      input,
      output,
    ): Promise<void> => {
      try {
        // Inject worktree session marker if running in a worktree
        if (state.isWorktree && state.activeChange.id) {
          output.system.push(
            `[ADV:WORKTREE_SESSION] You are working in a git worktree. ` +
              `Active change: ${state.activeChange.id}. ` +
              `All ADV state (changes, tasks, wisdom) is shared via external storage. ` +
              `Use adv_change_show and adv_task_ready to pick up where the parent session left off.`,
          );
        }

        if (!state.activeChange.id) return;

        const changeId = state.activeChange.id;
        const wisdom = await store.wisdom.list(changeId);
        const tasks = await store.tasks.list(changeId);

        // 1. Accumulated Wisdom Injection (limit to most recent entries to avoid context bloat)
        const MAX_WISDOM_ENTRIES = 10;
        if (wisdom.length > 0) {
          const recentWisdom = wisdom.slice(-MAX_WISDOM_ENTRIES);
          const wisdomList = recentWisdom
            .map((w) => `- [${w.type.toUpperCase()}] ${w.content}`)
            .join("\n");
          const truncationNote =
            wisdom.length > MAX_WISDOM_ENTRIES
              ? `\n(Showing ${MAX_WISDOM_ENTRIES} of ${wisdom.length} most recent entries)`
              : "";
          output.system.push(
            `[ADV:ACCUMULATED_WISDOM] The following wisdom has been accumulated for change ${changeId}:\n${wisdomList}${truncationNote}`,
          );
        }

        // 1b. Project-Level Wisdom Injection (cross-change durable learnings)
        const MAX_PROJECT_WISDOM = 10;
        try {
          const projectWisdom = await listProjectWisdom(store.paths.root, {
            wisdomPath: store.paths.wisdom,
          });
          if (projectWisdom.length > 0) {
            const recentProjectWisdom = projectWisdom.slice(
              0,
              MAX_PROJECT_WISDOM,
            );
            const projectWisdomList = recentProjectWisdom
              .map((w) => `- [${w.type.toUpperCase()}] ${w.content}`)
              .join("\n");
            const projectTruncationNote =
              projectWisdom.length > MAX_PROJECT_WISDOM
                ? `\n(Showing ${MAX_PROJECT_WISDOM} of ${projectWisdom.length} project-level entries)`
                : "";
            output.system.push(
              `[ADV:PROJECT_WISDOM] The following project-level wisdom applies across all changes:\n${projectWisdomList}${projectTruncationNote}`,
            );
          }
        } catch (e) {
          debugLog(`Project wisdom read error: ${e}`);
        }

        // 2. Todo Continuation Reminder
        const pendingTasks = tasks.filter(
          (t) => t.status === "pending" || t.status === "in_progress",
        );
        if (pendingTasks.length > 0) {
          const nextTasks = pendingTasks
            .slice(0, 3)
            .map((t) => `- ${t.title} (${t.id})`)
            .join("\n");
          output.system.push(
            `[ADV:TODO_CONTINUATION] Change ${changeId} has ${pendingTasks.length} tasks remaining. Next up:\n${nextTasks}\nPlease continue with these tasks until the change is complete.`,
          );
        }

        // 3. Wisdom Recording Prompt (if task just finished)
        if (state.lastCompletedTask) {
          output.system.push(
            `[ADV:RECORD_WISDOM] You just completed task "${state.lastCompletedTask.title}" (${state.lastCompletedTask.id}). If you learned anything (gotchas, patterns, successes), please record it using 'adv_wisdom_add'.`,
          );
          // Clear it after injecting so it only prompts once
          state.lastCompletedTask = null;
        }
      } catch (e) {
        debugLog(`experimental.chat.system.transform error: ${e}`);
      }
    },

    // ========================================================================
    // Session Compaction Hook
    // ========================================================================
    "experimental.session.compacting": async (input, output): Promise<void> => {
      try {
        // Add active change context for preservation
        if (state.activeChange.id) {
          const changeContext = [
            "=== ACTIVE ADV CHANGE ===",
            `Change ID: ${state.activeChange.id}`,
            state.activeChange.objective
              ? `Objective: ${state.activeChange.objective}`
              : "",
            "This change should be preserved across compaction.",
            "========================",
          ]
            .filter(Boolean)
            .join("\n");

          output.context.push(changeContext);
        }

        // Add project specs summary for context
        try {
          const specs = await store.specs.list({});
          if (specs.specs && specs.specs.length > 0) {
            const specsSummary = [
              "=== ADV SPECS CONTEXT ===",
              `Project has ${specs.specs.length} spec(s):`,
              ...specs.specs
                .slice(0, 5)
                .map(
                  (s: { name: string; title: string }) =>
                    `- ${s.name}: ${s.title}`,
                ),
              specs.specs.length > 5
                ? `... and ${specs.specs.length - 5} more`
                : "",
              "=========================",
            ]
              .filter(Boolean)
              .join("\n");

            output.context.push(specsSummary);
          }
        } catch {
          // Ignore errors reading specs
        }
      } catch {
        // Silently handle errors
      }
    },
  };
};

// Default export for OpenCode
export default AdvancePlugin;
