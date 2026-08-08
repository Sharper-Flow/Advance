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
import { WisdomTypeSchema, type Change } from "../types";
import {
  addProjectWisdom,
  compactProjectWisdom,
  listProjectWisdom,
} from "../storage/project-wisdom";
import { loadChange } from "../storage/change-projection-reader";
import { formatToolOutput } from "../utils/tool-output";
import { maybeAttachChangeTicker } from "../storage/context-snapshot-fetch";
import { coordinateChangeMutation } from "./change-mutation-coordinator";
import { withOptionalTargetPathStore } from "./target-project";
import { includeSnapshotSchema } from "./shared-args";
import { findDraft, promoteDraft } from "../utils/wisdom-draft";

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

        const nextDrafts =
          from_draft_id && draftTask
            ? promoteDraft(draftTask.wisdom_drafts, from_draft_id, entry.id)
            : undefined;
        const outcome = await coordinateChangeMutation<Change>({
          authority: {
            reason: "record wisdom entry",
            evidence: entry.id,
          },
          changesDir: store.paths.changes,
          intent: {
            changeId,
            mutationKind: "wisdom_added",
            mutateLatestProjection: (latest) => ({
              ...latest,
              wisdom: [...(latest.wisdom ?? []), entry],
              ...(nextDrafts && draftTask
                ? {
                    tasks: latest.tasks.map((task) =>
                      task.id === draftTask.id
                        ? { ...task, wisdom_drafts: nextDrafts }
                        : task,
                    ),
                  }
                : {}),
            }),
            verifyProjection: (readback) =>
              (readback.wisdom ?? []).some(
                (candidate) => candidate.id === entry.id,
              ),
          },
        });
        if (outcome.kind !== "verified") {
          return formatToolOutput({
            error:
              outcome.kind === "unverified" ||
              outcome.kind === "operator_required"
                ? outcome.reason
                : `Projection revision conflict: expected ${outcome.expected}, actual ${outcome.actual}`,
            changeId,
          });
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
              // Change-specific reads come from the disk projection. A missing
              // or malformed projection is an empty result, never a runtime
              // query failure.
              const projected = await loadChange(
                activeStore.paths.changes,
                changeId,
              );
              let entries: NonNullable<Change["wisdom"]> = [];
              if (!projected.success) {
                // Existing query contract deliberately treats malformed
                // projections as empty wisdom rather than a query failure.
                entries = [];
              } else if (!projected.data) {
                // not_found is a successful null result, distinct from the
                // explicit malformed/unreadable degradation above.
                entries = [];
              } else {
                entries = projected.data.wisdom ?? [];
              }
              if (wisdomType) {
                entries = entries.filter((e) => e.type === wisdomType);
              }
              wisdom = entries;
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
