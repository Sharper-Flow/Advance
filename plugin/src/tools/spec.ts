/**
 * Spec Tools
 *
 * Tools for querying and managing specifications.
 * These are data retrieval tools - no banners (return pure JSON).
 */

import { z } from "zod";
import type { Store } from "../storage/store";
import { formatToolOutput, paginate } from "../utils/tool-output";

// =============================================================================
// Tool Definitions
// =============================================================================

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
      store: Store,
    ) => {
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
