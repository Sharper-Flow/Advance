/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 *
 * Implements the @opencode-ai/plugin SDK interface with:
 * - tool: 36 MCP tools for spec/change/task/wisdom/agenda/test management
 * - event: Session status tracking, terminal UI updates
 * - tool.execute.before/after: Active change tracking, task completion detection
 * - experimental.session.compacting: Change preservation during compaction
 */

import { type Plugin } from "@opencode-ai/plugin";
import { createStore } from "./storage/store";
import { specTools } from "./tools/spec";
import { changeTools } from "./tools/change";
import { taskTools } from "./tools/task";
import { wisdomTools } from "./tools/wisdom";
import { statusTools } from "./tools/status";
import { agendaTools } from "./tools/agenda";
import { projectTools } from "./tools/project";
import { gateTools } from "./tools/gate";
import { testTools } from "./tools/test";
import {
  initializeStatus,
  cleanup as cleanupTerminal,
  getProjectName,
  setStatus,
  setActiveChange,
} from "./events";
import type { StatusMarker } from "./types";
import { bindTool, bindToolSimple, registerTool } from "./tool-registry";
import { safeExecute } from "./utils/safe-execute";
import { createHooks, type PluginState, type StatusFlags } from "./hooks";

import { getProjectId, getExternalRoot } from "./utils/project-id";
import { migrateToExternalState } from "./storage/migrate";
import { consumeHandoff } from "./storage/handoff";
import { appendDebugLog } from "./utils/debug-log";

// =============================================================================
// Debug Logging
// =============================================================================

const debugLog = (msg: string): void => appendDebugLog("index", msg);

// =============================================================================
// Status Resolution
// =============================================================================

/**
 * Resolve the current StatusMarker from plugin state flags.
 * Precedence: MIC > MOON > TDD_RED > TDD_GREEN > ROCKET > EARTH
 */
const resolveStatus = (s: PluginState): StatusMarker => {
  if (s.permissionPending) return "MIC";
  if (s.activeSubAgents > 0) return "MOON";
  if (s.tddPhase) return s.tddPhase;
  if (s.sessionIdle) return "EARTH";
  return "ROCKET";
};

// =============================================================================
// Plugin Export
// =============================================================================

export const AdvancePlugin: Plugin = async ({ directory, worktree }) => {
  const isWorktree = !!worktree && worktree !== directory;
  debugLog(
    `Plugin initializing: directory=${directory}, worktree=${worktree}, isWorktree=${isWorktree}`,
  );

  const projectId = await getProjectId(directory);
  let externalRoot: string | undefined;

  if (projectId) {
    externalRoot = getExternalRoot(projectId);
    debugLog(
      `External state: projectId=${projectId}, externalRoot=${externalRoot}`,
    );
    try {
      const report = await migrateToExternalState(directory, externalRoot);
      if (report.migrated.length > 0) {
        debugLog(
          `Migration completed: migrated=${report.migrated.join(",")}, skipped=${report.skipped.join(",")}`,
        );
      }
    } catch (e) {
      debugLog(`Migration failed (non-fatal): ${(e as Error).message}`);
    }
  } else {
    debugLog("No project ID (not a git repo?) — using legacy in-repo paths");
  }

  const store = await createStore(directory, { externalRoot });
  await store.init();

  const projectName = getProjectName(directory);
  debugLog(`Initializing status: projectName=${projectName}`);
  initializeStatus(projectName);

  const state: PluginState = {
    sessionIdle: true,
    activeSubAgents: 0,
    permissionPending: false,
    tddPhase: null,
    activeChange: { id: null, objective: null },
    lastCompletedTask: null,
    isWorktree,
  };

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

  const setFlags = (updates: Partial<StatusFlags>) => {
    Object.assign(state, updates);
    setStatus(resolveStatus(state));
  };

  const handleExit = () => {
    cleanupTerminal();
    try {
      store.close();
    } catch (e) {
      debugLog(`Error closing store on exit: ${e}`);
    }
  };

  let flushInFlight = false;
  const shutdownWithFlush = () => {
    cleanupTerminal();
    if (flushInFlight) return;
    flushInFlight = true;
    const flushTimeout = setTimeout(() => {
      try {
        store.close();
      } catch (e) {
        debugLog(`Error closing store on shutdown timeout: ${e}`);
      }
      process.exit(0);
    }, 3000);
    store.flush().finally(() => {
      clearTimeout(flushTimeout);
      try {
        store.close();
      } catch (e) {
        debugLog(`Error closing store after flush: ${e}`);
      }
      process.exit(0);
    });
  };

  const handleSigInt = shutdownWithFlush;
  const handleSigTerm = shutdownWithFlush;
  process.on("exit", handleExit);
  process.on("SIGINT", handleSigInt);
  process.on("SIGTERM", handleSigTerm);

  const removeProcessListeners = () => {
    process.removeListener("exit", handleExit);
    process.removeListener("SIGINT", handleSigInt);
    process.removeListener("SIGTERM", handleSigTerm);
  };

  const hooks = createHooks({ state, store, setFlags, removeProcessListeners });
  const agenda = store.paths.agenda;

  // ==========================================================================
  // Tool Registrations — one line per tool via bindTool / bindToolSimple
  // ==========================================================================

  return {
    tool: {
      // Spec
      adv_spec: bindTool(specTools.adv_spec, "adv_spec", store),

      // Change
      adv_change_list: bindTool(
        changeTools.adv_change_list,
        "adv_change_list",
        store,
      ),
      adv_change_show: bindTool(
        changeTools.adv_change_show,
        "adv_change_show",
        store,
      ),
      adv_change_create: bindTool(
        changeTools.adv_change_create,
        "adv_change_create",
        store,
      ),
      adv_change_update: bindTool(
        changeTools.adv_change_update,
        "adv_change_update",
        store,
      ),
      adv_change_close: bindTool(
        changeTools.adv_change_close,
        "adv_change_close",
        store,
      ),
      adv_change_validate: bindTool(
        changeTools.adv_change_validate,
        "adv_change_validate",
        store,
      ),
      adv_change_archive: bindTool(
        changeTools.adv_change_archive,
        "adv_change_archive",
        store,
      ),
      adv_change_add_issue: bindTool(
        changeTools.adv_change_add_issue,
        "adv_change_add_issue",
        store,
      ),
      adv_change_remove_issue: bindTool(
        changeTools.adv_change_remove_issue,
        "adv_change_remove_issue",
        store,
      ),

      // Task
      adv_task_show: bindTool(taskTools.adv_task_show, "adv_task_show", store),
      adv_task_list: bindTool(taskTools.adv_task_list, "adv_task_list", store),
      adv_task_ready: bindTool(
        taskTools.adv_task_ready,
        "adv_task_ready",
        store,
      ),
      adv_task_update: bindTool(
        taskTools.adv_task_update,
        "adv_task_update",
        store,
      ),
      adv_task_add: bindTool(taskTools.adv_task_add, "adv_task_add", store),
      adv_task_evidence: bindTool(
        taskTools.adv_task_evidence,
        "adv_task_evidence",
        store,
      ),
      adv_task_tdd_phase: bindTool(
        taskTools.adv_task_tdd_phase,
        "adv_task_tdd_phase",
        store,
      ),
      adv_task_tdd_status: bindTool(
        taskTools.adv_task_tdd_status,
        "adv_task_tdd_status",
        store,
      ),
      adv_task_cancel: bindTool(
        taskTools.adv_task_cancel,
        "adv_task_cancel",
        store,
      ),
      adv_task_reclassify_tdd: bindTool(
        taskTools.adv_task_reclassify_tdd,
        "adv_task_reclassify_tdd",
        store,
      ),

      // Wisdom
      adv_wisdom_add: bindTool(
        wisdomTools.adv_wisdom_add,
        "adv_wisdom_add",
        store,
      ),
      adv_wisdom_list: bindTool(
        wisdomTools.adv_wisdom_list,
        "adv_wisdom_list",
        store,
      ),
      adv_wisdom_promote: bindTool(
        wisdomTools.adv_wisdom_promote,
        "adv_wisdom_promote",
        store,
      ),

      // Status
      adv_status: bindTool(statusTools.adv_status, "adv_status", store),

      // Agenda
      adv_agenda_list: bindToolSimple(
        agendaTools.adv_agenda_list,
        "adv_agenda_list",
        directory,
        agenda,
      ),
      adv_agenda_add: bindToolSimple(
        agendaTools.adv_agenda_add,
        "adv_agenda_add",
        directory,
        agenda,
      ),
      adv_agenda_start: bindToolSimple(
        agendaTools.adv_agenda_start,
        "adv_agenda_start",
        directory,
        agenda,
      ),
      adv_agenda_complete: bindToolSimple(
        agendaTools.adv_agenda_complete,
        "adv_agenda_complete",
        directory,
        agenda,
      ),
      adv_agenda_cancel: bindToolSimple(
        agendaTools.adv_agenda_cancel,
        "adv_agenda_cancel",
        directory,
        agenda,
      ),
      adv_agenda_prioritize: bindToolSimple(
        agendaTools.adv_agenda_prioritize,
        "adv_agenda_prioritize",
        directory,
        agenda,
      ),
      adv_agenda_next: bindToolSimple(
        agendaTools.adv_agenda_next,
        "adv_agenda_next",
        directory,
        agenda,
      ),
      adv_agenda_stats: bindToolSimple(
        agendaTools.adv_agenda_stats,
        "adv_agenda_stats",
        directory,
        agenda,
      ),
      adv_agenda_evidence: bindToolSimple(
        agendaTools.adv_agenda_evidence,
        "adv_agenda_evidence",
        directory,
        agenda,
      ),
      adv_agenda_compact: bindToolSimple(
        agendaTools.adv_agenda_compact,
        "adv_agenda_compact",
        directory,
        agenda,
      ),

      // Project
      adv_project_context: bindTool(
        projectTools.adv_project_context,
        "adv_project_context",
        store,
      ),

      // Gate
      adv_gate_status: bindTool(
        gateTools.adv_gate_status,
        "adv_gate_status",
        store,
      ),
      adv_gate_complete: bindTool(
        gateTools.adv_gate_complete,
        "adv_gate_complete",
        store,
      ),

      // Test — adv_run_test needs directory as 3rd arg, use registerTool directly
      adv_run_test: registerTool(
        testTools.adv_run_test.description,
        testTools.adv_run_test.args,
        safeExecute(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async (args: any) =>
            testTools.adv_run_test.execute(args, store, directory),
          "adv_run_test",
        ),
      ),
    },

    ...hooks,
  };
};

// Default export for OpenCode
export default AdvancePlugin;
