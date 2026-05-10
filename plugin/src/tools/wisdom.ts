/**
 * Wisdom Tools
 *
 * Tools for managing cross-task learning (wisdom) within changes.
 * Wisdom entries capture patterns, successes, failures, gotchas, and conventions
 * discovered during task execution for injection into subsequent task context.
 */

import { z } from "zod";
import { nanoid } from "nanoid";
import type { ProductOriginTags, Store } from "../storage/store";
import { WisdomTypeSchema } from "../types";
import {
  addProjectWisdom,
  compactProjectWisdom,
  listProjectWisdom,
} from "../storage/project-wisdom";
import { wisdomAddedSignal, changeStateQuery } from "../temporal/messages";
import { formatToolOutput } from "../utils/tool-output";
import { fetchChangeContextTicker } from "../storage/context-snapshot-fetch";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import {
  fireSignalAndRefresh,
  querySignal,
  getChangeHandle,
} from "./_adapters";

async function getChangeHandleForChangeId(
  store: Store,
  changeId: string,
): Promise<ReturnType<typeof getChangeHandle> | null> {
  const bundle = getService();
  if (!bundle) return null;
  const projectId =
    store.productContext?.productProjectId ??
    (await getProjectId(store.paths.root));
  if (!projectId) return null;
  return getChangeHandle(bundle.client, projectId, changeId);
}

function getProductOriginTags(store: Store): ProductOriginTags | undefined {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return undefined;
  return {
    product_id: context.productId,
    origin_repo_id: context.currentRepoId,
    origin_repo_project_id: context.repoProjectId,
    origin_repo_path: context.currentRoot,
  };
}

function isProjectLevelWisdom(entry: { scope?: string }): boolean {
  return entry.scope === "project";
}

function isWisdomVisibleForProductScope(
  entry: ProductOriginTags & { scope?: string },
  store: Store,
  scope: "repo" | "product" | undefined,
): boolean {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return true;
  if (entry.product_id && entry.product_id !== context.productId) return false;
  if (scope === "product") return true;
  if (isProjectLevelWisdom(entry)) return true;
  if (!entry.product_id && !entry.origin_repo_id) return true;
  if (!entry.origin_repo_id) return true;
  return entry.origin_repo_id === context.currentRepoId;
}

function productContextOutput(
  store: Store,
  scope: "repo" | "product" | undefined,
): Record<string, unknown> | undefined {
  const context = store.productContext;
  if (!context || context.mode === "single_repo") return undefined;
  return {
    productId: context.productId,
    productProjectId: context.productProjectId,
    currentRepoId: context.currentRepoId,
    repoProjectId: context.repoProjectId,
    primaryRepoId: context.primaryRepoId,
    mode: context.mode,
    scope: scope ?? "repo",
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
        const origin = getProductOriginTags(store);
        const entry = {
          id: `ws-${nanoid(6)}`,
          type,
          content,
          source_task: sourceTask,
          recorded_at: new Date().toISOString(),
          ...origin,
        };

        // Signal-driven: fire wisdomAddedSignal to change workflow.
        // Uses fireSignalAndRefresh (rq-cacheRefresh01) so the in-memory
        // changeCache is invalidated after the signal fires — without
        // this, subsequent reads in the same session return stale state.
        const handle = await getChangeHandleForChangeId(store, changeId);
        if (handle) {
          await fireSignalAndRefresh(
            handle,
            store,
            changeId,
            wisdomAddedSignal,
            {
              entry,
              addedAt: entry.recorded_at,
            },
          );
        } else {
          // Fallback to disk store when Temporal is unavailable
          await store.wisdom.add(changeId, type, content, sourceTask, origin);
        }

        let promoted: unknown | undefined;
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

          promoted = await addProjectWisdom(store.paths.root, {
            type: entry.type,
            content: entry.content,
            sourceChange: changeId,
            sourceTask: entry.source_task,
            ...origin,
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

        let snapshot: string | undefined;
        try {
          snapshot = await fetchChangeContextTicker(store, changeId);
        } catch {
          // Snapshot emission is best-effort; never fail the tool
        }
        return formatToolOutput({
          success: true,
          entry,
          promoted,
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
      scope: z
        .enum(["repo", "product"])
        .optional()
        .describe(
          "For linked products: repo (default) filters to current repo plus promoted/global wisdom; product returns all product wisdom",
        ),
    },
    execute: async (
      {
        changeId,
        type,
        query,
        scope,
      }: {
        changeId?: string;
        type?: string;
        query?: string;
        scope?: "repo" | "product";
      },
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
          // Change-specific path: query workflow state, fallback to disk
          const handle = await getChangeHandleForChangeId(store, changeId);
          if (handle) {
            const state = await querySignal<{
              wisdom: Array<{
                id: string;
                type: string;
                content: string;
                source_task?: string;
                recorded_at: string;
              }>;
            }>(handle, changeStateQuery);
            let entries = state.wisdom ?? [];
            if (wisdomType) {
              entries = entries.filter((e) => e.type === wisdomType);
            }
            wisdom = entries;
          } else {
            let entries = await store.wisdom.list(changeId);
            if (wisdomType) {
              entries = entries.filter((e) => e.type === wisdomType);
            }
            wisdom = entries;
          }
        }

        wisdom = wisdom.filter((entry) =>
          isWisdomVisibleForProductScope(
            entry as ProductOriginTags & { scope?: string },
            store,
            scope,
          ),
        );

        // Calculate summary by type
        const byType: Record<string, number> = {};
        for (const entry of wisdom as { type: string }[]) {
          byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        return formatToolOutput({
          wisdom,
          count: wisdom.length,
          byType,
          ...(productContextOutput(store, scope)
            ? { _productContext: productContextOutput(store, scope) }
            : {}),
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
      scope: z
        .enum(["repo", "product"])
        .optional()
        .describe(
          "For linked products: repo (default) returns promoted/global entries relevant to this product; product returns all product wisdom",
        ),
    },
    execute: async (
      {
        maxEntries,
        scope,
      }: { maxEntries?: number; scope?: "repo" | "product" },
      store: Store,
    ) => {
      try {
        let entries: Array<{
          id: string;
          type: string;
          content: string;
          source_change?: string;
          source_task?: string;
          promoted_at?: string;
          product_id?: string;
          origin_repo_id?: string;
          origin_repo_project_id?: string;
          origin_repo_path?: string;
          scope?: string;
        }> = [];

        entries = await listProjectWisdom(store.paths.root, {
          maxEntries,
          wisdomPath: store.paths.wisdom,
        });
        entries = entries
          .map((entry) => ({ ...entry, scope: "project" }))
          .filter((entry) =>
            isWisdomVisibleForProductScope(entry, store, scope),
          );

        // Build byType summary — mirrors adv_wisdom_list shape (KD1)
        const byType: Record<string, number> = {};
        for (const entry of entries) {
          byType[entry.type] = (byType[entry.type] || 0) + 1;
        }

        return formatToolOutput({
          entries,
          count: entries.length,
          byType,
          ...(productContextOutput(store, scope)
            ? { _productContext: productContextOutput(store, scope) }
            : {}),
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
