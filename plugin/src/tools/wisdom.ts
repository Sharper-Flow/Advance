/**
 * Wisdom Tools
 *
 * Tools for managing cross-task learning (wisdom) within changes.
 * Wisdom entries capture patterns, successes, failures, gotchas, and conventions
 * discovered during task execution for injection into subsequent task context.
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import { WisdomTypeSchema } from "../types";
import {
  addProjectWisdom,
  compactProjectWisdom,
  listProjectWisdom,
} from "../storage/project-wisdom";
import { formatToolOutput } from "../utils/tool-output";

// =============================================================================
// Tool Definitions
// =============================================================================

export const wisdomTools = {
  adv_wisdom_add: {
    description:
      "Add a wisdom entry (learning) to a change. Captures patterns, successes, failures, gotchas, or conventions discovered during task execution.",
    args: {
      changeId: z.string().describe("Change ID to add wisdom to"),
      type: WisdomTypeSchema.describe(
        "Category: pattern | success | failure | gotcha | convention",
      ),
      content: z
        .string()
        .max(2000)
        .describe("The learning content (max 2000 chars)"),
      sourceTask: z
        .string()
        .optional()
        .describe("Task ID that generated this wisdom"),
    },
    execute: async (
      {
        changeId,
        type,
        content,
        sourceTask,
      }: {
        changeId: string;
        type: "pattern" | "success" | "failure" | "gotcha" | "convention";
        content: string;
        sourceTask?: string;
      },
      store: Store,
    ) => {
      try {
        const entry = await store.wisdom.add(
          changeId,
          type,
          content,
          sourceTask,
        );
        return formatToolOutput({
          success: true,
          entry,
          message: `Added ${type} wisdom to change ${changeId}`,
        });
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error ? error.message : "Failed to add wisdom",
        });
      }
    },
  },

  adv_wisdom_list: {
    description:
      "List or search wisdom entries. Optionally filter by type or search via FTS. Omit changeId to aggregate across all active changes and project-level wisdom.",
    args: {
      changeId: z
        .string()
        .optional()
        .describe("Change ID to list wisdom for (omit for cross-change aggregation)"),
      type: WisdomTypeSchema.optional().describe(
        "Filter by category: pattern | success | failure | gotcha | convention",
      ),
      query: z.string().optional().describe("FTS search term for relevance-ranked results"),
    },
    execute: async (
      { changeId, type, query }: { changeId?: string; type?: string; query?: string },
      store: Store,
    ) => {
      try {
        let wisdom: unknown[];
        const wisdomType = type as
          | "pattern" | "success" | "failure" | "gotcha" | "convention"
          | undefined;

        if (query) {
          // FTS search path — route through store.wisdom.search
          wisdom = await store.wisdom.search(query, { changeId, type: wisdomType });
        } else if (!changeId) {
          // Cross-change aggregation — route through store.wisdom.listAll
          wisdom = await store.wisdom.listAll({ type: wisdomType });
        } else {
          // Change-specific path (existing behavior)
          let entries = await store.wisdom.list(changeId);
          if (wisdomType) {
            entries = entries.filter((e) => e.type === wisdomType);
          }
          wisdom = entries;
        }

        // Calculate summary by type
        const byType: Record<string, number> = {};
        for (const entry of wisdom as { type: string }[]) {
          byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        return formatToolOutput({
          wisdom,
          count: wisdom.length,
          byType,
        });
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error ? error.message : "Failed to list wisdom",
        });
      }
    },
  },

  adv_project_wisdom_list: {
    description:
      "List project-level wisdom entries (durable learnings promoted across changes). Returns entries with summary by type — mirrors adv_wisdom_list response shape. Use this to surface cross-change conventions and patterns before starting work.",
    args: {
      maxEntries: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Maximum entries to return (default: all)"),
    },
    execute: async ({ maxEntries }: { maxEntries?: number }, store: Store) => {
      try {
        const entries = await listProjectWisdom(store.paths.root, {
          maxEntries,
          wisdomPath: store.paths.wisdom,
        });

        // Build byType summary — mirrors adv_wisdom_list shape (KD1)
        const byType: Record<string, number> = {};
        for (const entry of entries) {
          byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        return formatToolOutput({
          entries,
          count: entries.length,
          byType,
        });
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error
              ? error.message
              : "Failed to list project wisdom",
        });
      }
    },
  },

  adv_wisdom_promote: {
    description:
      "Promote a change-level wisdom entry to project-level wisdom. Durable convention/pattern learnings are recommended, but any wisdom type may be promoted manually when needed.",
    args: {
      changeId: z.string().describe("Change ID containing the wisdom entry"),
      wisdomId: z
        .string()
        .describe("Wisdom entry ID (ws-xxx) to promote to project level"),
    },
    execute: async (
      { changeId, wisdomId }: { changeId: string; wisdomId: string },
      store: Store,
    ) => {
      try {
        // Look up the change-level wisdom entry
        const entries = await store.wisdom.list(changeId);
        const entry = entries.find((e) => e.id === wisdomId);

        if (!entry) {
          return formatToolOutput({
            error: `Wisdom entry ${wisdomId} not found in change ${changeId}`,
          });
        }

        // Idempotency check: reject if already promoted
        const existing = await listProjectWisdom(store.paths.root, {
          wisdomPath: store.paths.wisdom,
        });
        const isDuplicate = existing.some(
          (e) =>
            e.source_change === changeId &&
            e.content === entry.content &&
            e.type === entry.type,
        );
        if (isDuplicate) {
          return formatToolOutput({
            error: `Wisdom entry ${wisdomId} already promoted from change ${changeId}`,
          });
        }

        // Promote to project-level wisdom
        const promoted = await addProjectWisdom(store.paths.root, {
          type: entry.type,
          content: entry.content,
          sourceChange: changeId,
          sourceTask: entry.source_task,
          wisdomPath: store.paths.wisdom,
        });

        // Compact if over the 50-entry cap (best-effort — don't fail promotion)
        try {
          await compactProjectWisdom(store.paths.root, {
            wisdomPath: store.paths.wisdom,
          });
        } catch {
          // Compaction failure is non-fatal; promotion already succeeded
        }

        return formatToolOutput({
          success: true,
          promoted,
          message: `Promoted ${entry.type} wisdom to project level`,
        });
      } catch (error) {
        return formatToolOutput({
          error:
            error instanceof Error ? error.message : "Failed to promote wisdom",
        });
      }
    },
  },
};
