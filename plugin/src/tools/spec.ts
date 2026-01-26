/**
 * Spec Tools
 *
 * Tools for querying and managing specifications.
 * These are data retrieval tools - no banners (return pure JSON).
 */

import { z } from "zod";
import type { Store } from "../storage/store";

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
      return JSON.stringify(result, null, 2);
    },
  },

  adv_spec_show: {
    description: "Get full specification details by capability ID",
    args: {
      capability: z
        .string()
        .describe("Capability ID (e.g., 'contract-system')"),
    },
    execute: async ({ capability }: { capability: string }, store: Store) => {
      const spec = await store.specs.get(capability);
      if (!spec) {
        return JSON.stringify({ error: `Spec not found: ${capability}` });
      }
      return JSON.stringify(spec, null, 2);
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
      return JSON.stringify({ results }, null, 2);
    },
  },
};
