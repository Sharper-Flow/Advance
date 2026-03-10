/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */

import { join } from "path";
import type { Store } from "../storage/store";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import {
  GATE_ORDER,
  isGateSatisfied,
  type GateId,
  type FeatureFlags,
} from "../types";
import { getCommandsByGate } from "../manifest";
import {
  countSuccessCriteria,
  formatContextSnapshot,
} from "../utils/context-snapshot";
import {
  loadProjectConfigWithDiagnostics,
  loadProposalWithFallback,
} from "../storage/json";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";

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

      // Add manifest-driven gate recommendations for active changes,
      // ordered by recency (most recently active first)
      const recentChanges = status.changes.recent ?? [];
      for (const rc of recentChanges) {
        const changeResult = await store.changes.get(rc.id);
        if (!changeResult.success || !changeResult.data) continue;

        const gates = await store.gates.get(rc.id);
        const changeDir = join(store.paths.changes, rc.id);
        const { content: proposalText } = await loadProposalWithFallback(
          changeDir,
          changeResult.data.title,
        );
        const taskCounts = {
          done: changeResult.data.tasks.filter((t) => t.status === "done")
            .length,
          in_progress: changeResult.data.tasks.filter(
            (t) => t.status === "in_progress",
          ).length,
          pending: changeResult.data.tasks.filter((t) => t.status === "pending")
            .length,
          cancelled: changeResult.data.tasks.filter(
            (t) => t.status === "cancelled",
          ).length,
        };
        const currentTask = changeResult.data.tasks.find(
          (t) => t.status === "in_progress",
        );

        Object.assign(rc, {
          _contextSnapshot: formatContextSnapshot({
            changeId: changeResult.data.id,
            title: changeResult.data.title,
            successCriteriaCount: countSuccessCriteria(proposalText),
            gates: gates ?? undefined,
            taskCounts,
            workdir: store.paths.root,
            currentTask: currentTask
              ? { id: currentTask.id, title: currentTask.title }
              : undefined,
          }),
        });
      }

      for (const rc of recentChanges) {
        const gates = await store.gates.get(rc.id);
        if (!gates) continue;

        // Find first incomplete gate
        const nextGate = GATE_ORDER.find(
          (gateId) => !isGateSatisfied(gates[gateId]),
        );

        if (nextGate) {
          const rec = getRecommendationForGate(nextGate as GateId, rc.id);
          if (rec) {
            status.recommendations.push(rec);
          }
        }
      }

      // Add clarify-readiness recommendations for active changes with ambiguity.
      // Keep these immediately after gate recommendations so the workflow
      // guidance stays grouped by change before recency notices.
      const features = store.config?.features as FeatureFlags | undefined;
      const clarifyMode = features?.clarify_enforcement ?? "advisory";

      if (clarifyMode !== "off") {
        for (const rc of recentChanges) {
          const changeResult = await store.changes.get(rc.id);
          if (!changeResult.success || !changeResult.data) continue;

          const changeDir = join(store.paths.changes, rc.id);
          const { content: proposalText } = await loadProposalWithFallback(
            changeDir,
            changeResult.data.title,
          );

          const clarifyResult = runClarifyReadinessChecks(
            changeResult.data,
            proposalText,
          );

          if (clarifyResult.findings.length > 0) {
            status.recommendations.push(
              `⚠️ Change \`${rc.id}\` has ${clarifyResult.findings.length} ambiguity finding(s) — run \`/adv-clarify ${rc.id}\` to resolve`,
            );
          }
        }
      }

      // Add recency-aware recommendations for stale and hot changes
      for (const rc of recentChanges) {
        if (rc.recency === "stale") {
          const hours = Math.floor(rc.minutesSinceActivity / 60);
          const label =
            hours >= 24 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`;
          status.recommendations.push(
            `⏰ Stale change \`${rc.id}\` (last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done) — resume with \`/adv-apply ${rc.id}\``,
          );
        } else if (rc.recency === "hot") {
          status.recommendations.push(
            `🔥 Change \`${rc.id}\` is hot (active ${rc.minutesSinceActivity}m ago) — likely in-flight by another agent`,
          );
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
