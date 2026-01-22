/**
 * Status Tool
 *
 * Project-wide status overview.
 */

import { z } from "zod";
import type { Store } from "../storage/store";

// =============================================================================
// Tool Definitions
// =============================================================================

export const statusTools = {
  adv_status: {
    description: "Get project status overview including specs, changes, and recommendations",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const status = await store.status();
      return JSON.stringify(status, null, 2);
    },
  },
};
