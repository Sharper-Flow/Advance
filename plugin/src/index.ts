/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 */

import { z } from "zod";
import { createStore, type Store } from "./storage/store";
import { specTools } from "./tools/spec";
import { changeTools } from "./tools/change";
import { taskTools } from "./tools/task";
import { statusTools } from "./tools/status";
import { agendaTools } from "./tools/agenda";
import {
  initializeStatus,
  cleanup as cleanupEvents,
  getProjectName,
} from "./events";

// =============================================================================
// Plugin Types (stub until @opencode-ai/plugin SDK is published)
// =============================================================================

interface PluginContext {
  directory: string;
}

interface PluginResult {
  name: string;
  version: string;
  tools: Record<string, unknown>;
  onSessionStart?: () => Promise<void>;
  onSessionEnd?: () => Promise<void>;
}

type Plugin = (context: PluginContext) => Promise<PluginResult>;

// =============================================================================
// Plugin Export
// =============================================================================

export const AdvancePlugin: Plugin = async ({ directory }: PluginContext) => {
  // Initialize store
  const store = await createStore(directory);

  // Helper to wrap tool execution with store injection
  const wrapTool = <T extends Record<string, unknown>>(toolDef: {
    description: string;
    args: Record<string, z.ZodType>;
    execute: (args: T, store: Store) => Promise<string>;
  }) => ({
    description: toolDef.description,
    parameters: z.object(toolDef.args as z.ZodRawShape),
    execute: async (args: T) => toolDef.execute(args, store),
  });

  // Helper to wrap agenda tools (use directory instead of store)
  const wrapAgendaTool = <T extends Record<string, unknown>>(toolDef: {
    description: string;
    args: Record<string, z.ZodType>;
    execute: (args: T, projectDir: string) => Promise<string>;
  }) => ({
    description: toolDef.description,
    parameters: z.object(toolDef.args as z.ZodRawShape),
    execute: async (args: T) => toolDef.execute(args, directory),
  });

  return {
    name: "advance",
    version: "0.1.0",

    // Register all tools
    tools: {
      // Spec tools
      adv_spec_list: wrapTool(specTools.adv_spec_list),
      adv_spec_show: wrapTool(specTools.adv_spec_show),
      adv_spec_search: wrapTool(specTools.adv_spec_search),

      // Change tools
      adv_change_list: wrapTool(changeTools.adv_change_list),
      adv_change_show: wrapTool(changeTools.adv_change_show),
      adv_change_create: wrapTool(changeTools.adv_change_create),
      adv_change_validate: wrapTool(changeTools.adv_change_validate),
      adv_change_archive: wrapTool(changeTools.adv_change_archive),

      // Task tools
      adv_task_list: wrapTool(taskTools.adv_task_list),
      adv_task_ready: wrapTool(taskTools.adv_task_ready),
      adv_task_update: wrapTool(taskTools.adv_task_update),
      adv_task_add: wrapTool(taskTools.adv_task_add),

      // TDD evidence tools
      adv_task_evidence: wrapTool(taskTools.adv_task_evidence),
      adv_task_tdd_phase: wrapTool(taskTools.adv_task_tdd_phase),
      adv_task_skip_tdd: wrapTool(taskTools.adv_task_skip_tdd),
      adv_task_tdd_status: wrapTool(taskTools.adv_task_tdd_status),

      // Status tool
      adv_status: wrapTool(statusTools.adv_status),

      // Agenda tools (lightweight task contracts)
      adv_agenda_list: wrapAgendaTool(agendaTools.adv_agenda_list),
      adv_agenda_add: wrapAgendaTool(agendaTools.adv_agenda_add),
      adv_agenda_start: wrapAgendaTool(agendaTools.adv_agenda_start),
      adv_agenda_complete: wrapAgendaTool(agendaTools.adv_agenda_complete),
      adv_agenda_cancel: wrapAgendaTool(agendaTools.adv_agenda_cancel),
      adv_agenda_prioritize: wrapAgendaTool(agendaTools.adv_agenda_prioritize),
      adv_agenda_next: wrapAgendaTool(agendaTools.adv_agenda_next),
      adv_agenda_stats: wrapAgendaTool(agendaTools.adv_agenda_stats),
      adv_agenda_evidence: wrapAgendaTool(agendaTools.adv_agenda_evidence),
      adv_agenda_compact: wrapAgendaTool(agendaTools.adv_agenda_compact),
    },

    // Lifecycle hooks
    onSessionStart: async () => {
      await store.init();
      await store.sync();

      // Initialize terminal status
      const projectName = getProjectName(directory);
      initializeStatus(projectName);
    },

    onSessionEnd: async () => {
      store.close();
      cleanupEvents();
    },
  };
};

// Default export for OpenCode
export default AdvancePlugin;

// Re-export types for consumers
export * from "./types";
export type { Store } from "./storage/store";

// Re-export events for direct usage
export * from "./events";
