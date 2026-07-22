/**
 * Wisdom Tools
 *
 * Tools for managing cross-task learning (wisdom) within changes.
 * Wisdom entries capture patterns, successes, failures, gotchas, and conventions
 * discovered during task execution for injection into subsequent task context.
 *
 * consolidateAdvToolSurface2 (tk-11d902254d63): `adv_project_wisdom_list` was
 * removed; its project-only listing lives on as `adv_wisdom_list` with
 * `project_only: true` and a bounded `maxEntries` limit applied AFTER type
 * and product-visibility filtering (DDC6). No alias or wrapper remains.
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
import {
  taskUpdatedSignal,
  wisdomAddedSignal,
  changeStateQuery,
} from "../temporal/messages";
import { formatToolOutput } from "../utils/tool-output";
import { maybeAttachChangeTicker } from "../storage/context-snapshot-fetch";
import { getService } from "../temporal/service";
import { getProjectId } from "../utils/project-id";
import {
  fireSignalAndRefresh,
  querySignal,
  getChangeHandle,
} from "./_adapters";
import { withOptionalTargetPathStore } from "./target-project";
import { includeSnapshotSchema } from "./shared-args";
import { findDraft, promoteDraft } from "../utils/wisdom-draft";

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
    ...(context.degraded !== undefined && { degraded: context.degraded }),
    ...(context.readOnly !== undefined && { readOnly: context.readOnly }),
    ...(context.warning !== undefined && { warning: context.warning }),
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
      from_draft_id: z
        .string()
        .optional()
        .describe(
          "Promote a WisdomDraft into a real wisdom entry. Requires sourceTask. Validates draft exists on the same task in the 'suggested' state, pre-populates type/content from the draft (caller may override), and atomically marks the draft 'promoted' after the wisdom add succeeds (rq-wisdomAutoSurfacing01 / AC6 / DDC5).",
        ),
      ...includeSnapshotSchema.shape,
    },
    execute: async (
      {
        changeId,
        type,
        content,
        sourceTask,
        promote,
        from_draft_id,
        include,
      }: {
        changeId: string;
        type: "pattern" | "success" | "failure" | "gotcha" | "convention";
        content: string;
        sourceTask?: string;
        promote?: boolean;
        from_draft_id?: string;
        include?: { snapshot?: boolean };
      },
      store: Store,
    ) => {
      try {
        // rq-wisdomAutoSurfacing01 / D6 / AC6: from_draft_id promotion path.
        // Validates the draft, pre-populates type/content, and atomically
        // marks the draft 'promoted' after the wisdom entry is added.
        let draftTask:
          | {
              id: string;
              wisdom_drafts?: import("../types").WisdomDraft[] | undefined;
            }
          | undefined;
        if (from_draft_id) {
          if (!sourceTask) {
            return formatToolOutput({
              error:
                "from_draft_id requires sourceTask to identify the task that owns the draft",
              code: "FROM_DRAFT_ID_REQUIRES_SOURCE_TASK",
              changeId,
            });
          }
          try {
            const taskRecord = await store.tasks.show(sourceTask);
            if (taskRecord?.task) {
              draftTask = taskRecord.task as typeof draftTask;
            }
          } catch {
            // fall through to not-found handling
          }
          const draft = findDraft(draftTask?.wisdom_drafts, from_draft_id);
          if (!draft) {
            return formatToolOutput({
              error: `Draft ${from_draft_id} not found on task ${sourceTask}`,
              code: "DRAFT_NOT_FOUND",
              changeId,
              sourceTask,
            });
          }
          if (draft.status === "promoted") {
            return formatToolOutput({
              error: `Draft ${from_draft_id} is already promoted (wisdom_id: ${draft.promoted_wisdom_id ?? "unknown"})`,
              code: "DRAFT_ALREADY_PROMOTED",
              changeId,
              sourceTask,
            });
          }
          if (draft.status === "dismissed") {
            return formatToolOutput({
              error: `Draft ${from_draft_id} was dismissed (${draft.dismiss_reason ?? "unknown"}) and cannot be promoted`,
              code: "DRAFT_DISMISSED",
              changeId,
              sourceTask,
            });
          }
          // Pre-population semantics: when from_draft_id is provided, the
          // caller typically echoes draft.suggested_type and
          // draft.suggested_content as `type` and `content`. Type+content
          // remain required args (backward-compat); the draft's suggested_*
          // fields are advisory inputs the caller may copy. The draft's
          // source_attempts and lifecycle history ride along on the task.
        }

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

        // rq-wisdomAutoSurfacing01 / DDC5: atomic draft promotion — only
        // after the wisdom add succeeded. Fire taskUpdatedSignal with the
        // new wisdom_drafts array (Object.assign replaces the field).
        //
        // TOCTOU (correctness-5): concurrent from_draft_id calls can both
        // pass validation against the same draft snapshot and both fire
        // wisdomAddedSignal, then the second taskUpdatedSignal's
        // Object.assign in applyTaskUpdatedToState overwrites the first
        // promotion. Single-agent session model makes this theoretical;
        // CAS-style fix deferred to fast-follow child change.
        if (from_draft_id && draftTask) {
          const nextDrafts = promoteDraft(
            draftTask.wisdom_drafts,
            from_draft_id,
            entry.id,
          );
          if (nextDrafts && handle) {
            try {
              await fireSignalAndRefresh(
                handle,
                store,
                changeId,
                taskUpdatedSignal,
                {
                  taskId: draftTask.id,
                  partial: { wisdom_drafts: nextDrafts },
                  updatedAt: entry.recorded_at,
                },
              );
            } catch {
              // Draft promotion is best-effort after the wisdom add
              // succeeded. Do not fail the whole tool. Wisdom entry is
              // already durable; draft may be re-promoted or auto-dismissed
              // at checkpoint.
            }
          } else if (nextDrafts && !handle) {
            // Temporal unavailable (tdd-gap-wisdom-temporal-fallback):
            // wisdom add succeeded via disk fallback above, but draft
            // promotion requires a Temporal signal that we cannot fire.
            // Surface the inconsistency to the caller so the agent knows
            // the draft is still in the "suggested" state despite the
            // wisdom entry being durable. The draft will be auto-dismissed
            // at checkpoint or can be re-promoted when Temporal returns.
            return formatToolOutput({
              success: true,
              entry,
              _warning:
                "Draft promotion skipped: Temporal unavailable. Wisdom entry is durable but draft remains in 'suggested' state.",
            });
          }
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

        const output: Record<string, unknown> = {
          success: true,
          entry,
          promoted,
          message: promote
            ? `Added and promoted ${type} wisdom for change ${changeId}`
            : `Added ${type} wisdom to change ${changeId}`,
        };
        await maybeAttachChangeTicker(output, include, store, changeId);
        return formatToolOutput(output);
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
      "List or search wisdom entries. Optionally filter by type or search via FTS. Omit changeId to aggregate across all active changes and project-level wisdom. Set project_only to list only durable project-level learnings (promoted across changes); maxEntries bounds the project_only listing after filtering.",
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
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. Reads a snapshot and returns _projectContext.",
        ),
      project_only: z
        .boolean()
        .optional()
        .describe(
          "When true, list only project-level wisdom (durable learnings promoted across changes). Cannot be combined with changeId or query.",
        ),
      maxEntries: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe(
          "Maximum entries to return for project_only listings (default: all). Applied after type and product-visibility filtering.",
        ),
    },
    execute: async (
      {
        changeId,
        type,
        query,
        scope,
        target_path,
        project_only,
        maxEntries,
      }: {
        changeId?: string;
        type?: string;
        query?: string;
        scope?: "repo" | "product";
        target_path?: string;
        project_only?: boolean;
        maxEntries?: number;
      },
      store: Store,
    ) => {
      // Folded project-reader contract (consolidateAdvToolSurface2,
      // tk-11d902254d63): project_only is mutually exclusive with
      // changeId/query, and maxEntries bounds only the project_only listing.
      if (project_only && changeId) {
        return formatToolOutput({
          error: "project_only cannot be combined with changeId",
        });
      }
      if (project_only && query) {
        return formatToolOutput({
          error: "project_only cannot be combined with query",
        });
      }
      if (maxEntries !== undefined && !project_only) {
        return formatToolOutput({
          error: "maxEntries requires project_only: true",
        });
      }
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          try {
            let wisdom: unknown[];
            const wisdomType = type as
              | "pattern"
              | "success"
              | "failure"
              | "gotcha"
              | "convention"
              | undefined;

            if (project_only) {
              // Project-wisdom branch folded in from the removed
              // adv_project_wisdom_list. DDC6: read unbounded, then apply
              // the type filter and the shared product-visibility filter
              // BEFORE the bounded limit below so the limit never starves
              // visible entries.
              const entries = await listProjectWisdom(activeStore.paths.root, {
                wisdomPath: activeStore.paths.wisdom,
              });
              let projectEntries = entries.map((entry) => ({
                ...entry,
                scope: "project",
              }));
              if (wisdomType) {
                projectEntries = projectEntries.filter(
                  (e) => e.type === wisdomType,
                );
              }
              wisdom = projectEntries;
            } else if (query) {
              // FTS search path — route through store.wisdom.search
              wisdom = await activeStore.wisdom.search(query, {
                changeId,
                type: wisdomType,
              });
            } else if (!changeId) {
              // Cross-change aggregation — route through store.wisdom.listAll
              wisdom = await activeStore.wisdom.listAll({ type: wisdomType });
            } else {
              // Change-specific path: query workflow state for the current
              // project, fallback to disk. target_path reads intentionally stay
              // on the disk-snapshot store returned by withOptionalTargetPathStore
              // so cross-project reads cannot observe or depend on live Temporal
              // workflow state.
              const handle = projectContext
                ? null
                : await getChangeHandleForChangeId(activeStore, changeId);
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
                let entries = await activeStore.wisdom.list(changeId);
                if (wisdomType) {
                  entries = entries.filter((e) => e.type === wisdomType);
                }
                wisdom = entries;
              }
            }

            wisdom = wisdom.filter((entry) =>
              isWisdomVisibleForProductScope(
                entry as ProductOriginTags & { scope?: string },
                activeStore,
                scope,
              ),
            );

            // DDC6: the bounded limit applies only after project filtering
            // and product visibility filtering.
            if (project_only && maxEntries !== undefined) {
              wisdom = wisdom.slice(0, maxEntries);
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
              ...(productContextOutput(activeStore, scope)
                ? { _productContext: productContextOutput(activeStore, scope) }
                : {}),
              ...(projectContext ? { _projectContext: projectContext } : {}),
            });
          } catch (error) {
            return formatToolOutput({
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to list wisdom",
            });
          }
        },
      );
    },
  },
};
