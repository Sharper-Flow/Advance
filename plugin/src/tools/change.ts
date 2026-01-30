/**
 * Change Tools
 *
 * Tools for managing change proposals.
 */

import { z } from "zod";
import type { Spec } from "../types";
import { createDefaultGates, getIncompleteGates, allGatesSatisfied } from "../types";
import type { Store } from "../storage/store";
import { validateChange } from "../validator";
import { archiveChange } from "../archive";
import { wrapWithBanner } from "../utils/banner";

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
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return JSON.stringify({ error: result.error });
      }
      if (!result.data) {
        return JSON.stringify({ error: `Change not found: ${changeId}` });
      }
      return JSON.stringify(result.data, null, 2);
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
      return wrapWithBanner(
        { command: "adv_change_create", target: result.changeId },
        JSON.stringify(result, null, 2),
      );
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
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_validate", target: changeId },
          JSON.stringify({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_validate", target: changeId },
          JSON.stringify({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;

      // Load all specs for validation context
      const specList = await store.specs.list();
      const specs: Spec[] = [];
      for (const specInfo of specList.specs) {
        const specResult = await store.specs.get(specInfo.name);
        if (specResult.success && specResult.data) {
          specs.push(specResult.data);
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
        const fullChangeResult = await store.changes.get(activeChange.id);
        if (fullChangeResult.success && fullChangeResult.data) {
          activeChange.capabilities = Object.keys(fullChangeResult.data.deltas);
        }
      }

      // Run full validation with active changes for conflict detection
      const validationResult = await validateChange(change, {
        specs,
        activeChanges,
      });

      // In strict mode, treat warnings as errors
      const passed = strict
        ? validationResult.errors.length === 0 &&
          validationResult.warnings.length === 0
        : validationResult.passed;

      return wrapWithBanner(
        { command: "adv_change_validate", target: changeId },
        JSON.stringify(
          {
            passed,
            errors: validationResult.errors,
            warnings: validationResult.warnings,
            checksPerformed: validationResult.checksPerformed,
            checkedAt: validationResult.checkedAt,
          },
          null,
          2,
        ),
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
      const result = await store.changes.get(changeId);
      if (!result.success) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          JSON.stringify({ error: result.error }),
        );
      }
      if (!result.data) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          JSON.stringify({ error: `Change not found: ${changeId}` }),
        );
      }

      const change = result.data;

      // Check all tasks complete
      const incompleteTasks = change.tasks.filter(
        (t) => t.status !== "done" && t.status !== "cancelled",
      );
      if (incompleteTasks.length > 0) {
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          JSON.stringify({
            error: "Cannot archive: incomplete tasks",
            incompleteTasks: incompleteTasks.map((t) => ({
              id: t.id,
              title: t.title,
            })),
          }),
        );
      }

      // Check all gates are complete (6-gate quality checklist)
      const gates = change.gates ?? createDefaultGates();
      if (!allGatesSatisfied(gates)) {
        const incompleteGates = getIncompleteGates(gates);
        return wrapWithBanner(
          { command: "adv_change_archive", target: changeId },
          JSON.stringify({
            error: "Cannot archive: incomplete gates. Complete all 6 quality gates before archiving.",
            incompleteGates,
            hint: `Run /adv-gate-status ${changeId} to see gate details`,
          }),
        );
      }

      // Load all specs for delta application
      const specList = await store.specs.list();
      const specs = new Map<string, Spec>();
      for (const specInfo of specList.specs) {
        const specResult = await store.specs.get(specInfo.name);
        if (specResult.success && specResult.data) {
          specs.set(specInfo.name, specResult.data);
        }
      }

      // Run the archive operation
      const archiveResult = await archiveChange({
        change,
        specs,
        paths: store.paths,
        dryRun,
      });

      // Update change status in store (unless dry run)
      if (!dryRun && archiveResult.success) {
        change.status = "archived";
        await store.changes.save(change);
      }

      return wrapWithBanner(
        { command: "adv_change_archive", target: changeId },
        JSON.stringify(
          {
            success: archiveResult.success,
            specsUpdated: archiveResult.specsUpdated.map((s) => ({
              capability: s.capability,
              version: `${s.originalVersion} → ${s.newVersion}`,
              deltas: s.deltaResults.length,
            })),
            docsGenerated: archiveResult.docsGenerated,
            archivePath: archiveResult.archivePath,
            errors: archiveResult.errors,
            dryRun: dryRun ?? false,
          },
          null,
          2,
        ),
      );
    },
  },
};
