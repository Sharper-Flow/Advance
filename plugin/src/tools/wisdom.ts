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
import {
  addProjectWisdomUpdate,
  projectWisdomQuery,
} from "../temporal/messages";
import { writeJsonlAtomic } from "../storage/jsonl-atomic-writer";
import { formatToolOutput } from "../utils/tool-output";
import { fetchChangeContextSnapshot } from "../utils/context-snapshot";
import { getBoundedProjectWorkflowAccess } from "./project-workflow-helper";

function toJsonlProjectWisdomEntry(entry: {
  id: string;
  type: string;
  content: string;
  sourceChange?: string;
  sourceTask?: string;
  promotedAt: string;
  tags?: string[];
  invalidatedBy?: string;
}) {
  return {
    id: entry.id,
    type: entry.type,
    content: entry.content,
    source_change: entry.sourceChange,
    source_task: entry.sourceTask,
    promoted_at: entry.promotedAt,
    tags: entry.tags,
    invalidated_by: entry.invalidatedBy,
  };
}

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
      promote: z
        .boolean()
        .optional()
        .describe("When true, also promote the added wisdom to project level"),
    },
    execute: async (
      {
        changeId,
        type,
        content,
        sourceTask,
        promote,
      }: {
        changeId: string;
        type: "pattern" | "success" | "failure" | "gotcha" | "convention";
        content: string;
        sourceTask?: string;
        promote?: boolean;
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

        let promoted: unknown | undefined;
        let promoteWarning: string | undefined;
        if (promote) {
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
              error: `Wisdom entry ${entry.id} already promoted from change ${changeId}`,
            });
          }

          let temporalMutationCommitted = false;
          let temporalBundleClose: (() => Promise<void>) | undefined;
          try {
            const temporal = await getBoundedProjectWorkflowAccess({
              projectDir: store.paths.root,
              mutablePath: store.paths.wisdom,
            });

            if (temporal.mode !== "workflow-backed") {
              promoted = await addProjectWisdom(store.paths.root, {
                type: entry.type,
                content: entry.content,
                sourceChange: changeId,
                sourceTask: entry.source_task,
                wisdomPath: store.paths.wisdom,
              });

              if (temporal.mode === "unavailable") {
                promoteWarning = `Project workflow unavailable: ${temporal.reason}. Fell back to local project wisdom.`;
              }

              try {
                await compactProjectWisdom(store.paths.root, {
                  wisdomPath: store.paths.wisdom,
                });
              } catch {
                // Compaction failure is non-fatal; add/promote already succeeded
              }

              const snapshot = await fetchChangeContextSnapshot(store, changeId);
              return formatToolOutput({
                success: true,
                entry,
                promoted,
                ...(promoteWarning ? { warning: promoteWarning } : {}),
                ...(snapshot ? { _contextSnapshot: snapshot } : {}),
                message: `Added and promoted ${type} wisdom for change ${changeId}`,
              });
            }

            temporalBundleClose = () => temporal.bundle.connection.close();
            promoted = await temporal.handle.executeUpdate(
              addProjectWisdomUpdate,
              {
                args: [
                  {
                    type: entry.type,
                    content: entry.content,
                    sourceChange: changeId,
                    sourceTask: entry.source_task,
                  },
                ],
              },
            );
            temporalMutationCommitted = true;

            const latest = (await temporal.handle.query(
              projectWisdomQuery,
              undefined,
            )) as Array<Parameters<typeof toJsonlProjectWisdomEntry>[0]>;
            await writeJsonlAtomic(
              store.paths.wisdom,
              latest.map(toJsonlProjectWisdomEntry),
            );
            await temporal.bundle.connection.close();
          } catch (error) {
            if (temporalBundleClose) {
              await temporalBundleClose().catch(() => undefined);
            }
            if (temporalMutationCommitted) {
              promoteWarning =
                error instanceof Error
                  ? `Workflow state updated but derived wisdom.jsonl write failed: ${error.message}`
                  : "Workflow state updated but derived wisdom.jsonl write failed";
            } else {
              promoted = await addProjectWisdom(store.paths.root, {
                type: entry.type,
                content: entry.content,
                sourceChange: changeId,
                sourceTask: entry.source_task,
                wisdomPath: store.paths.wisdom,
              });

              try {
                await compactProjectWisdom(store.paths.root, {
                  wisdomPath: store.paths.wisdom,
                });
              } catch {
                // Compaction failure is non-fatal; add/promote already succeeded
              }
            }
          }
        }

        const snapshot = await fetchChangeContextSnapshot(store, changeId);
        return formatToolOutput({
          success: true,
          entry,
          promoted,
          ...(promoteWarning ? { warning: promoteWarning } : {}),
          ...(snapshot ? { _contextSnapshot: snapshot } : {}),
          message: promote
            ? `Added and promoted ${type} wisdom for change ${changeId}`
            : `Added ${type} wisdom to change ${changeId}`,
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
        .describe(
          "Change ID to list wisdom for (omit for cross-change aggregation)",
        ),
      type: WisdomTypeSchema.optional().describe(
        "Filter by category: pattern | success | failure | gotcha | convention",
      ),
      query: z
        .string()
        .optional()
        .describe("FTS search term for relevance-ranked results"),
    },
    execute: async (
      {
        changeId,
        type,
        query,
      }: { changeId?: string; type?: string; query?: string },
      store: Store,
    ) => {
      try {
        let wisdom: unknown[];
        const wisdomType = type as
          | "pattern"
          | "success"
          | "failure"
          | "gotcha"
          | "convention"
          | undefined;

        if (query) {
          // FTS search path — route through store.wisdom.search
          wisdom = await store.wisdom.search(query, {
            changeId,
            type: wisdomType,
          });
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
};
