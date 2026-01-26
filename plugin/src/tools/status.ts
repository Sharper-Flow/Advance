/**
 * Status Tool
 *
 * Project-wide status overview.
 */

import type { Store } from "../storage/store";
import { wrapWithBanner } from "../utils/banner";

// =============================================================================
// Tool Definitions
// =============================================================================

export const statusTools = {
  adv_status: {
    description:
      "Get project status overview including specs, changes, and recommendations",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const status = await store.status();
      return wrapWithBanner(
        { command: "adv_status" },
        JSON.stringify(status, null, 2),
      );
    },
  },
};
