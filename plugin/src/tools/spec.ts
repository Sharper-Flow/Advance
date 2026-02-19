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
  adv_spec_list: {
    description: "List all specifications with optional filtering",
    args: {
      capability: z.string().optional().describe("Filter by capability name"),
      tag: z.string().optional().describe("Filter by tag"),
    },
    execute: async (
      { capability, tag }: { capability?: string; tag?: string },
      store: Store,
    ) => {
      const result = await store.specs.list({ capability, tag });
      return formatToolOutput(result);
    },
  },

  adv_spec_show: {
    description: "Get full specification details by capability ID",
    args: {
      capability: z
        .string()
        .describe("Capability ID (e.g., 'contract-system')"),
      limit: z
        .number()
        .optional()
        .describe("Max requirements to return (default: 50)"),
      offset: z
        .number()
        .optional()
        .describe("Requirement offset for pagination (default: 0)"),
    },
    execute: async (
      {
        capability,
        limit,
        offset,
      }: { capability: string; limit?: number; offset?: number },
      store: Store,
    ) => {
      const result = await store.specs.get(capability);
      if (!result.success) {
        return formatToolOutput({ error: result.error });
      }
      if (!result.data) {
        return formatToolOutput({ error: `Spec not found: ${capability}` });
      }
      const spec = result.data;
      const paged = paginate(spec.requirements, {
        limit,
        offset,
        tool: "adv_spec_show",
        args: `capability: "${capability}"`,
      });
      return formatToolOutput({
        ...spec,
        requirements: paged.items,
        _requirementPagination: paged.pagination,
      });
    },
  },

  adv_spec_search: {
    description: "Full-text search across all specifications (FTS5)",
    args: {
      query: z.string().describe("Search query"),
      limit: z.number().optional().describe("Maximum results (default: 20)"),
    },
    execute: async (
      { query, limit }: { query: string; limit?: number },
      store: Store,
    ) => {
      const results = await store.specs.search(query, limit);
      return formatToolOutput({ results });
    },
  },
};
