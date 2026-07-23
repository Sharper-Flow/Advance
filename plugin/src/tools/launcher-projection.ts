/**
 * Launcher Projection Tools
 *
 * Producer-owned MCP tools for rebuilding the aggregate launcher projection
 * from on-disk per-change projections. These tools are intentionally plugin-
 * only (never exposed via bin/adv) and do not touch Temporal workflows.
 */

import { join } from "path";
import type { Store } from "../storage/store";
import { getProjectId, getExternalRoot } from "../utils/project-id";
import { buildLauncherProjection } from "../storage/launcher-projection";
import { atomicWriteFile } from "../utils/fs";
import { formatToolOutput } from "../utils/tool-output";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("launcher-projection");

export const launcherProjectionTools = {
  adv_launcher_projection_rebuild: {
    description:
      "Rebuild the aggregate launcher projection (active-launcher-state.json) from " +
      "the on-disk per-change projection set. Producer-only MCP tool; does not touch " +
      "Temporal workflows or bin/adv.",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const projectId = await getProjectId(store.paths.root);
      if (!projectId) {
        return formatToolOutput({
          ok: false,
          error:
            "Could not resolve project identity for the current directory.",
        });
      }

      const externalRoot = getExternalRoot(projectId);
      const changesDir = join(externalRoot, "changes");
      const archiveDir = join(externalRoot, "archive");
      const generatedAt = new Date().toISOString();
      const path = join(externalRoot, "active-launcher-state.json");

      try {
        const projection = await buildLauncherProjection({
          changesDir,
          archiveDir,
          generatedAt,
          degradedThresholdMs: 300_000,
        });

        await atomicWriteFile(path, `${JSON.stringify(projection, null, 2)}\n`);

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
          projectId,
          externalRoot,
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
