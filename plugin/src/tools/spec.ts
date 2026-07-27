/**
 * Spec Tools
 *
 * Tools for querying and managing specifications.
 * These are data retrieval tools - no banners (return pure JSON).
 */

import { existsSync } from "fs";
import { join } from "path";
import { z } from "zod";
import type { Store } from "../storage/store-types";
import { listSpecDirs, loadSpec } from "../storage/spec-filesystem";
import type { SearchResult } from "../storage/store-types";
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
      const { store, worktree, directory } = ctx;
      const resolvedSpecsDir = resolveActiveSpecsDir({
        contextWorktree: worktree,
        contextDirectory: directory,
        fallbackSpecsDir: store.paths.specs,
      });

      switch (args.action) {
        case "list": {
          const dirs = await listSpecDirs(resolvedSpecsDir);
          const out: Array<{
            name: string;
            title: string;
            version: string;
            requirementCount: number;
          }> = [];
          for (const name of dirs) {
            if (args.capability && name !== args.capability) continue;
            const result = await loadSpec(resolvedSpecsDir, name);
            if (!result.success || !result.data) continue;
            if (args.tag) {
              const specTags = (result.data.tags ?? []) as string[];
              const reqTags = (result.data.requirements ?? []).flatMap(
                (req) => ((req as { tags?: string[] }).tags ?? []) as string[],
              );
              const allTags = new Set([...specTags, ...reqTags]);
              if (!allTags.has(args.tag)) continue;
            }
            out.push({
              name: result.data.name,
              title: result.data.title ?? result.data.name,
              version:
                typeof result.data.version === "string"
                  ? result.data.version
                  : String(result.data.version ?? "1"),
              requirementCount: (result.data.requirements ?? []).length,
            });
          }
          return formatToolOutput({ specs: out });
        }

        case "show": {
          if (!args.capability) {
            return formatToolOutput({
              error: "capability is required for 'show' action",
            });
          }
          const result = await loadSpec(resolvedSpecsDir, args.capability);
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
          const dirs = await listSpecDirs(resolvedSpecsDir);
          const results: SearchResult[] = [];
          const lower = args.query.toLowerCase();
          for (const name of dirs) {
            const result = await loadSpec(resolvedSpecsDir, name);
            if (!result.success || !result.data) continue;
            for (const req of result.data.requirements ?? []) {
              const reqAny = req as {
                id: string;
                title?: string;
                body?: string;
              };
              const haystack = [reqAny.title ?? "", reqAny.body ?? ""]
                .join("\n")
                .toLowerCase();
              if (!haystack.includes(lower)) continue;
              results.push({
                spec: result.data.name,
                requirement: reqAny.id,
                title: reqAny.title ?? reqAny.id,
                match: reqAny.body ?? "",
              });
              if (results.length >= (args.limit ?? 20))
                return formatToolOutput({ results });
            }
          }
          return formatToolOutput({ results });
        }
      }
    },
  },
};
