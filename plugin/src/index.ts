/**
 * Advance (ADV) Plugin
 *
 * Spec-driven development with specs as laws.
 * Primary interface for AI agents to manage specs, changes, and tasks.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { z } from "zod";
import { createStore } from "./storage/store";
import { specTools } from "./tools/spec";
import { changeTools } from "./tools/change";
import { taskTools } from "./tools/task";
import { statusTools } from "./tools/status";

// =============================================================================
// Plugin Export
// =============================================================================

export const AdvancePlugin: Plugin = async ({ directory }) => {
  // Initialize store
  const store = await createStore(directory);

  // Helper to wrap tool execution with store injection
  const wrapTool = <T extends Record<string, unknown>>(
    toolDef: {
      description: string;
      args: Record<string, z.ZodType>;
      execute: (args: T, store: typeof store) => Promise<string>;
    }
  ) => ({
    description: toolDef.description,
    parameters: z.object(toolDef.args as z.ZodRawShape),
    execute: async (args: T) => toolDef.execute(args, store),
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

      // Status tool
      adv_status: wrapTool(statusTools.adv_status),
    },

    // Lifecycle hooks
    onSessionStart: async () => {
      await store.init();
      await store.sync();
    },

    onSessionEnd: async () => {
      store.close();
    },
  };
};

// Default export for OpenCode
export default AdvancePlugin;

// Re-export types for consumers
export * from "./types";
export type { Store } from "./storage/store";
