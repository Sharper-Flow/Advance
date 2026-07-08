/**
 * Spec Tools
 *
 * Tools for querying and managing specifications.
 * These are data retrieval tools - no banners (return pure JSON).
 */

import { existsSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput, paginate } from "../utils/tool-output";

// =============================================================================
// Spec directory resolution
// =============================================================================

/**
 * Resolve the active specs directory using a pure, deterministic priority:
 *
 * 1. SDK context.worktree (or context.directory when it is itself a worktree).
 * 2. Active-change worktree via join(worktreeBase, "change", activeChangeId).
 * 3. Legacy fallback: store.paths.specs.
 *
 * Each candidate is guarded by existsSync so we never return a speculative path.
 */
export function resolveActiveSpecsDir(opts: {
  contextWorktree?: string;
  contextDirectory?: string;
  activeChangeId?: string | null;
  worktreeBase?: string | null;
  fallbackSpecsDir: string;
  specsDirName?: string;
}): string {
  const {
    contextWorktree,
    contextDirectory,
    activeChangeId,
    worktreeBase,
    fallbackSpecsDir,
    specsDirName = ".adv/specs",
  } = opts;

  if (contextWorktree) {
    const dir = join(contextWorktree, specsDirName);
    if (existsSync(dir)) return dir;
  }

  if (contextDirectory) {
    const dir = join(contextDirectory, specsDirName);
    if (existsSync(dir)) return dir;
  }

  if (activeChangeId && worktreeBase) {
    const dir = join(worktreeBase, "change", activeChangeId, specsDirName);
    if (existsSync(dir)) return dir;
  }

  return fallbackSpecsDir;
}

// =============================================================================
// Tool Definitions
// =============================================================================

export interface SpecToolContext {
  store: Store;
  worktree?: string;
  directory?: string;
}

export const specTools = {
  adv_spec: {
    description: "Manage and query specifications (list, show, search)",
    args: {
      action: z
        .enum(["list", "show", "search"])
        .describe("Action to perform on specifications"),
      capability: z
        .string()
        .optional()
        .describe("Capability ID for 'show' or filter for 'list'"),
      tag: z.string().optional().describe("Filter by tag for 'list'"),
      query: z.string().optional().describe("Search query for 'search'"),
      limit: z.number().optional().describe("Maximum results to return"),
      offset: z.number().optional().describe("Offset for pagination"),
    },
    execute: async (
      args: {
        action: "list" | "show" | "search";
        capability?: string;
        tag?: string;
        query?: string;
        limit?: number;
        offset?: number;
      },
      ctx: SpecToolContext,
    ) => {
      const { store } = ctx;
      switch (args.action) {
        case "list": {
          const result = await store.specs.list({
            capability: args.capability,
            tag: args.tag,
          });
          return formatToolOutput(result);
        }

        case "show": {
          if (!args.capability) {
            return formatToolOutput({
              error: "capability is required for 'show' action",
            });
          }
          const result = await store.specs.get(args.capability);
          if (!result.success) {
            return formatToolOutput({ error: result.error });
          }
          if (!result.data) {
            return formatToolOutput({
              error: `Spec not found: ${args.capability}`,
            });
          }
          const spec = result.data;
          const paged = paginate(spec.requirements, {
            limit: args.limit,
            offset: args.offset,
            tool: "adv_spec",
            args: `action: "show", capability: "${args.capability}"`,
          });
          return formatToolOutput({
            ...spec,
            requirements: paged.items,
            _requirementPagination: paged.pagination,
          });
        }

        case "search": {
          if (!args.query) {
            return formatToolOutput({
              error: "query is required for 'search' action",
            });
          }
          const results = await store.specs.search(args.query, args.limit);
          return formatToolOutput({ results });
        }
      }
    },
  },
};
