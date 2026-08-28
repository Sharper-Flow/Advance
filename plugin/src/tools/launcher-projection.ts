/**
 * Launcher Projection Tools
 *
 * Producer-owned MCP tools for rebuilding the aggregate launcher projection
 * from on-disk per-change projections. These tools are intentionally plugin-
 * only (never exposed via bin/adv) and do not touch external runtimes.
 */

import type { Store } from "../storage/store-types";
import { buildLauncherProjection } from "../storage/launcher-projection";
import { writeLauncherProjection } from "../storage/launcher-projection-writer";
import { rebuildSummaryIndex } from "../storage/change-summary-shard";
import { formatToolOutput } from "../utils/tool-output";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("launcher-projection");

const launcherProjectionToolDefinitions = {
  // rq-launcherProjectionTruth01 — producer-owned rebuild trigger regenerates
  // the durable active-launcher-state aggregate from on-disk per-change projections.
  adv_launcher_projection_rebuild: {
    description:
      "Rebuild the aggregate launcher projection (active-launcher-state.json) from " +
      "the on-disk per-change projection set. Producer-only MCP tool; does not touch " +
      "external runtimes or bin/adv.",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const generatedAt = new Date().toISOString();
      const path = store.paths.external
        ? `${store.paths.external}/active-launcher-state.json`
        : `${store.paths.root}/.adv/active-launcher-state.json`;

      try {
        // Summary pointers are downstream caches. Regenerate them from
        // canonical change.json before the aggregate reader is allowed to
        // inspect them; stale flat envelopes are never consulted here.
        const summaryRebuild = await rebuildSummaryIndex({
          changesDir: store.paths.changes,
          summariesDir: store.paths.summariesDir,
        });
        if (summaryRebuild.kind === "error") {
          throw new Error(summaryRebuild.error);
        }
        if (summaryRebuild.errors.length > 0) {
          logger.warn("summary-index-rebuild-partial", {
            root: store.paths.root,
            errors: summaryRebuild.errors,
          });
        }

        const projection = await buildLauncherProjection({
          changesDir: store.paths.changes,
          summariesDir: store.paths.summariesDir,
          archiveDir: store.paths.archive,
          generatedAt,
          degradedThresholdMs: 300_000,
        });

        await writeLauncherProjection(path, projection);

        return formatToolOutput({
          ok: true,
          path,
          active_count: projection.active_count,
          generated_at: projection.generated_at,
          degraded: projection.degraded,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn("launcher-projection-rebuild-failed", {
          root: store.paths.root,
          error: message,
        });
        return formatToolOutput({
          ok: false,
          error: `Failed to rebuild launcher projection: ${message}`,
        });
      }
    },
  },
};

export const launcherProjectionTools = launcherProjectionToolDefinitions;
