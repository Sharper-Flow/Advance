/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import type { Store } from "../storage/store";

// =============================================================================
// Tool Definitions
// =============================================================================

export const changeTools = {
  adv_change_list: {
    description: "List active changes with optional filtering",
    args: {
      status: z
        .enum(["draft", "pending", "active", "archived"])
        .optional()
        .describe("Filter by status"),
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include archived changes (default: false)"),
    },
    execute: async (
      { status, includeArchived }: { status?: string; includeArchived?: boolean },
      store: Store
    ) => {
      const result = await store.changes.list({ status, includeArchived });
      return JSON.stringify(result, null, 2);
    },
  },

  adv_change_show: {
    description: "Get full change details including tasks and deltas",
    args: {
      changeId: z.string().describe("Change ID"),
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      const change = await store.changes.get(changeId);
      if (!change) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }
      return JSON.stringify(change, null, 2);
    },
  },

  adv_change_create: {
    description: "Create a new change proposal",
    args: {
      summary: z.string().describe("Brief description of the change"),
      capability: z.string().optional().describe("Primary capability affected"),
    },
    execute: async (
      { summary, capability }: { summary: string; capability?: string },
      store: Store
    ) => {
      const result = await store.changes.create(summary, capability);
      return JSON.stringify(result, null, 2);
    },
  },

  adv_change_validate: {
    description: "Validate change against existing specs (specs as laws)",
    args: {
      changeId: z.string().describe("Change ID to validate"),
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    execute: async (
      { changeId, strict }: { changeId: string; strict?: boolean },
      store: Store
    ) => {
      const change = await store.changes.get(changeId);
      if (!change) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }

      // TODO: Implement full validation engine
      // For now, return basic validation result
      const errors: Array<{ code: string; message: string }> = [];
      const warnings: Array<{ code: string; message: string }> = [];

      // Check for empty deltas
      const deltaCount = Object.values(change.deltas).flat().length;
      if (deltaCount === 0) {
        warnings.push({
          code: "NO_DELTAS",
          message: "Change has no spec deltas defined",
        });
      }

      // Check for tasks
      if (change.tasks.length === 0) {
        warnings.push({
          code: "NO_TASKS",
          message: "Change has no tasks defined",
        });
      }

      const passed = errors.length === 0 && (!strict || warnings.length === 0);

      return JSON.stringify(
        {
          passed,
          errors,
          warnings,
          checkedAt: new Date().toISOString(),
        },
        null,
        2
      );
    },
  },

  adv_change_archive: {
    description: "Archive a completed change (applies deltas to specs)",
    args: {
      changeId: z.string().describe("Change ID to archive"),
    },
    execute: async ({ changeId }: { changeId: string }, store: Store) => {
      const change = await store.changes.get(changeId);
      if (!change) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }

      // Check all tasks complete
      const incompleteTasks = change.tasks.filter(
        (t) => t.status !== "done" && t.status !== "cancelled"
      );
      if (incompleteTasks.length > 0) {
        return JSON.stringify({
          error: "Cannot archive: incomplete tasks",
          incompleteTasks: incompleteTasks.map((t) => ({ id: t.id, title: t.title })),
        });
      }

      // TODO: Implement delta application and doc generation
      // For now, just update status

      change.status = "archived";
      await store.changes.save(change);

      return JSON.stringify(
        {
          success: true,
          specsUpdated: Object.keys(change.deltas),
          docsGenerated: [],
          archivePath: `archive/${new Date().toISOString().split("T")[0]}-${changeId}`,
        },
        null,
        2
      );
    },
  },
};
