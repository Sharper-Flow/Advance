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

      // Warn when external state is unavailable — worktree sharing and
      // state isolation won't function.  This happens when the plugin
      // directory is not inside a git repo and no project.path fallback
      // was available (e.g. GUI clients starting from $HOME).
      if (!store.paths.external) {
        status.recommendations.unshift(
          "⚠️  Running without external state — ADV state is stored in-repo (.adv/). " +
            "Worktree sharing and state isolation are unavailable. " +
            "Ensure OpenCode is started from a git repository.",
        );
      }

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

      // Single-pass over recent changes: context snapshot, gate recommendation,
      // clarify readiness, and recency labels — all built in one traversal.
      const recentChanges = status.changes.recent ?? [];
      const features = store.config?.features as FeatureFlags | undefined;
      const clarifyMode = features?.clarify_enforcement ?? "advisory";

      for (const rc of recentChanges) {
        // Fetch change data, gates, and proposal ONCE per change
        const changeResult = await store.changes.get(rc.id);
        if (!changeResult.success || !changeResult.data) continue;

        const gates = await store.gates.get(rc.id);
        const changeDir = join(store.paths.changes, rc.id);
        const { content: proposalText } = await loadProposalWithFallback(
          changeDir,
          changeResult.data.title,
        );

        // 1) Context snapshot
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

        // 2) Gate recommendation (reuses gates fetched above)
        if (gates) {
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

        // 3) Clarify readiness (reuses changeResult and proposalText)
        if (clarifyMode !== "off") {
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

        // 4) Recency labels
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
