/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import type { Spec } from "../types";
import type { Store } from "../storage/store";
import { validateChange } from "../validator";
import { archiveChange } from "../archive";

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
      {
        status,
        includeArchived,
      }: { status?: string; includeArchived?: boolean },
      store: Store,
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
      store: Store,
    ) => {
      const result = await store.changes.create(summary, capability);
      return JSON.stringify(result, null, 2);
    },
  },

  adv_change_validate: {
    description:
      "Validate change against existing specs (specs as laws) and check for conflicts with other active changes",
    args: {
      changeId: z.string().describe("Change ID to validate"),
      strict: z.boolean().optional().describe("Treat warnings as errors"),
    },
    execute: async (
      { changeId, strict }: { changeId: string; strict?: boolean },
      store: Store,
    ) => {
      const change = await store.changes.get(changeId);
      if (!change) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }

      // Load all specs for validation context
      const specList = await store.specs.list();
      const specs: Spec[] = [];
      for (const specInfo of specList.specs) {
        const spec = await store.specs.get(specInfo.name);
        if (spec) {
          specs.push(spec);
        }
      }

      // Load other active changes for conflict detection
      const changeList = await store.changes.list({ includeArchived: false });
      const activeChanges = changeList.changes
        .filter((c) => c.id !== changeId) // Exclude self
        .map((c) => ({
          id: c.id,
          title: c.title,
          capabilities: [] as string[], // Will be populated below
        }));

      // Load full change data to get capabilities
      for (const activeChange of activeChanges) {
        const fullChange = await store.changes.get(activeChange.id);
        if (fullChange) {
          activeChange.capabilities = Object.keys(fullChange.deltas);
        }
      }

      // Run full validation with active changes for conflict detection
      const result = await validateChange(change, { specs, activeChanges });

      // In strict mode, treat warnings as errors
      const passed = strict
        ? result.errors.length === 0 && result.warnings.length === 0
        : result.passed;

      return JSON.stringify(
        {
          passed,
          errors: result.errors,
          warnings: result.warnings,
          checksPerformed: result.checksPerformed,
          checkedAt: result.checkedAt,
        },
        null,
        2,
      );
    },
  },

  adv_change_archive: {
    description: "Archive a completed change (applies deltas to specs)",
    args: {
      changeId: z.string().describe("Change ID to archive"),
      dryRun: z
        .boolean()
        .optional()
        .describe("Preview changes without writing"),
    },
    execute: async (
      { changeId, dryRun }: { changeId: string; dryRun?: boolean },
      store: Store,
    ) => {
      const change = await store.changes.get(changeId);
      if (!change) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }

      // Check all tasks complete
      const incompleteTasks = change.tasks.filter(
        (t) => t.status !== "done" && t.status !== "cancelled",
      );
      if (incompleteTasks.length > 0) {
        return JSON.stringify({
          error: "Cannot archive: incomplete tasks",
          incompleteTasks: incompleteTasks.map((t) => ({
            id: t.id,
            title: t.title,
          })),
        });
      }

      // Load all specs for delta application
      const specList = await store.specs.list();
      const specs = new Map<string, Spec>();
      for (const specInfo of specList.specs) {
        const spec = await store.specs.get(specInfo.name);
        if (spec) {
          specs.set(specInfo.name, spec);
        }
      }

      // Run the archive operation
      const result = await archiveChange({
        change,
        specs,
        paths: store.paths,
        dryRun,
      });

      // Update change status in store (unless dry run)
      if (!dryRun && result.success) {
        change.status = "archived";
        await store.changes.save(change);
      }

      return JSON.stringify(
        {
          success: result.success,
          specsUpdated: result.specsUpdated.map((s) => ({
            capability: s.capability,
            version: `${s.originalVersion} → ${s.newVersion}`,
            deltas: s.deltaResults.length,
          })),
          docsGenerated: result.docsGenerated,
          archivePath: result.archivePath,
          errors: result.errors,
          dryRun: dryRun ?? false,
        },
        null,
        2,
      );
    },
  },
};
