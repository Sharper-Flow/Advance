/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */

import type { Store } from "../storage/store";
import { wrapWithBanner } from "../utils/banner";
import { GATE_ORDER, isGateSatisfied, type GateId } from "../types";
import { getCommandsByGate } from "../manifest";

// =============================================================================
// Helpers
// =============================================================================

/**
 * Map a gate ID to a recommended slash command string.
 * Uses the manifest to find commands that trigger the given gate.
 * Falls back to a sensible default if no manifest entry exists.
 */
function getRecommendationForGate(
  gateId: GateId,
  changeId: string,
): string | null {
  const cmds = getCommandsByGate(gateId);
  if (cmds.length === 0) {
    // signoff has no direct command — it's user-triggered
    if (gateId === "signoff") {
      return `Change \`${changeId}\`: next gate is \`signoff\` (user confirmation required)`;
    }
    return null;
  }

  // Pick the first (primary) command for this gate
  const cmd = cmds[0];
  return `Change \`${changeId}\`: next gate is \`${gateId}\` → run \`/${cmd.name} ${changeId}\``;
}

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

      // Add manifest-driven gate recommendations for active changes
      const changeList = await store.changes.list();
      for (const change of changeList.changes) {
        const gates = await store.gates.get(change.id);
        if (!gates) continue;

        // Find first incomplete gate
        const nextGate = GATE_ORDER.find(
          (gateId) => !isGateSatisfied(gates[gateId]),
        );

        if (nextGate) {
          const rec = getRecommendationForGate(nextGate as GateId, change.id);
          if (rec) {
            status.recommendations.push(rec);
          }
        }
      }

      return wrapWithBanner(
        { command: "adv_status" },
        JSON.stringify(status, null, 2),
      );
    },
  },
};
