/**
 * Changes Domain Operations
 *
 * Factory function that returns the `changes` namespace of the Store interface.
 * Extracted from store.ts to keep domain logic co-located and testable.
 */

import type { Change } from "../types";
import {
  loadChange,
  saveChange,
  createChangeScaffold,
  updateChangeArtifacts,
  resolveChangeId,
  listChangeDirs,
} from "./json";
import { shouldCheckpoint, checkpointWAL } from "./health";
import type { StoreContext } from "./store-context";
import type { Store } from "./store";
import { generateChangeId } from "../utils/change-id";
import { withChangeLock } from "./store-locks";

export function createChangesOps(
  ctx: StoreContext,
  ensureAllChangesSynced: () => Promise<void>,
  saveFn: (change: Change) => Promise<void>,
): Store["changes"] {
  const paths = ctx.paths;

  return {
    list: async (filter) => {
      // Lazy sync: list needs all changes for complete results
      await ensureAllChangesSynced();

      let rows = ctx.sqlite.changes.list({ status: filter?.status });

      // Exclude archived/closed unless requested
      if (!filter?.includeArchived) {
        rows = rows.filter((r) => r.status !== "archived");
      }
      if (!filter?.includeClosed) {
        rows = rows.filter((r) => r.status !== "closed");
      }

      // Aggregated task counts in one query (replaces N+1 per-row tasks.list)
      const taskCounts = ctx.sqlite.tasks.countByChange();
      const countMap = new Map(taskCounts.map((tc) => [tc.change_id, tc]));

      return {
        changes: rows.map((c) => {
          const counts = countMap.get(c.id);
          return {
            id: c.id,
            title: c.title,
            status: c.status as import("../types").ChangeStatus,
            taskCount: counts?.total ?? 0,
            completedTasks: counts?.done ?? 0,
          };
        }),
      };
    },

    get: async (changeId) => {
      // Support partial ID matching (e.g., just "abc1" instead of full ID)
      const { id: resolvedId, candidates } = await resolveChangeId(
        paths.changes,
        changeId,
      );

      if (!resolvedId) {
        if (candidates.length > 1) {
          return {
            success: false,
            error: `Ambiguous change ID "${changeId}". Matches: ${candidates.join(", ")}. Please be more specific.`,
            type: "not_found" as const,
          };
        }
        return {
          success: false,
          error: `Change not found: ${changeId}`,
          type: "not_found" as const,
        };
      }

      return loadChange(paths.changes, resolvedId);
    },

    create: async (
      summary,
      _capability,
      proposalContent,
      problemStatementContent,
      agreementContent,
      designContent,
    ) => {
      // Generate concise change ID from summary
      const baseId = generateChangeId(summary);

      // Check for collisions and detect potential duplicates
      const existingDirs = await listChangeDirs(paths.changes);
      let changeId = baseId;
      let counter = 2;
      let duplicateWarning: string | undefined;
      while (existingDirs.includes(changeId)) {
        changeId = `${baseId}${counter}`;
        counter++;
      }

      // If we had to increment, warn about potential duplicate
      if (changeId !== baseId) {
        duplicateWarning =
          `WARNING: Change ID "${baseId}" already exists. ` +
          `Created "${changeId}" instead. ` +
          `This may indicate a duplicate change — verify that "${baseId}" ` +
          `is not the same work before proceeding. ` +
          `If this was unintentional, delete "${changeId}" and use the existing change.`;
      }

      // Create scaffold
      const {
        changePath,
        proposalPath,
        problemStatementPath,
        agreementPath,
        designPath,
      } = await createChangeScaffold(
        paths.changes,
        changeId,
        summary,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
      );

      // Create change.json
      const change: Change = {
        $schema:
          "https://raw.githubusercontent.com/anomalyco/oc-plugins/main/advance/plugin/schemas/change.schema.json",
        id: changeId,
        title: summary,
        status: "draft",
        created_at: new Date().toISOString(),
        tasks: [],
        deltas: {},
      };

      await saveChange(paths.changes, change);
      ctx.sqlite.changes.upsert(change, changePath);

      return {
        changeId,
        path: proposalPath,
        problemStatementPath,
        agreementPath,
        designPath,
        duplicateWarning,
      };
    },

    save: async (change) => {
      return withChangeLock(ctx, change.id, async () => {
        const jsonPath = await saveChange(paths.changes, change);
        ctx.sqlite.changes.upsert(change, jsonPath);
        if (shouldCheckpoint(ctx.dbPath)) {
          checkpointWAL(ctx.sqlite.db);
        }
      });
    },

    close: async (changeId, closure) => {
      return withChangeLock(ctx, changeId, async (change) => {
        if (change.status === "archived") {
          throw new Error(
            `Cannot close archived change: ${change.id}. Archived changes are already completed.`,
          );
        }

        change.status = "closed";
        change.closure = closure;

        await saveFn(change);
        return change;
      });
    },

    updateArtifacts: async (
      changeId: string,
      proposalContent?: string,
      problemStatementContent?: string,
      agreementContent?: string,
      designContent?: string,
    ) => {
      // Resolve changeId against existing directories (consistent with changes.get)
      const { id: resolvedId, candidates } = await resolveChangeId(
        paths.changes,
        changeId,
      );

      if (!resolvedId) {
        const hint =
          candidates.length > 0
            ? ` Did you mean one of: ${candidates.join(", ")}?`
            : "";
        return {
          success: false,
          error: `Change not found: "${changeId}".${hint} Cannot update artifacts for a change that does not exist.`,
        };
      }

      const result = await updateChangeArtifacts(
        paths.changes,
        resolvedId,
        proposalContent,
        problemStatementContent,
        agreementContent,
        designContent,
      );

      if (result.error) {
        return { success: false, error: result.error };
      }

      return {
        success: true,
        proposalPath: result.proposalPath,
        problemStatementPath: result.problemStatementPath,
        agreementPath: result.agreementPath,
        designPath: result.designPath,
      };
    },
  };
}
