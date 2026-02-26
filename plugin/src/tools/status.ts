/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */

import type { Store } from "../storage/store";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import { GATE_ORDER, isGateSatisfied, type GateId } from "../types";
import { getCommandsByGate } from "../manifest";
import { loadProjectConfigWithDiagnostics } from "../storage/json";

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
      "Show project overview: specs, active changes, and next-step recommendations",
    args: {},
    execute: async (_args: Record<string, never>, store: Store) => {
      const status = await store.status();

      // Load project config with diagnostics — surface errors instead of silently ignoring
      const configResult = await loadProjectConfigWithDiagnostics(
        store.paths.root,
      );
      let featureFlags: Record<string, unknown> | undefined;

      if (!configResult.success) {
        // Prepend config error/warning to recommendations so it's visible
        const prefix =
          configResult.type === "not_found"
            ? "⚠️  Config warning"
            : "❌ Config error";
        status.recommendations.unshift(`${prefix}: ${configResult.error}`);
      } else {
        // Expose feature flags in status output for visibility
        featureFlags = configResult.data.features as Record<string, boolean>;
      }

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

      const output = featureFlags
        ? { ...status, feature_flags: featureFlags }
        : status;

      return wrapWithBanner(
        { command: "adv_status" },
        formatToolOutput(output),
      );
    },
  },
};
