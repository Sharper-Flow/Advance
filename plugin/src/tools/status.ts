/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */

import { basename, join } from "path";
import type { Store } from "../storage/store";
import {
  buildProjectWorkflowId,
  createTemporalClientBundle,
  getTemporalAddress,
} from "../temporal/client";
import { canReachTemporalAddress } from "../temporal/runtime-manager";
import { projectMigrationLedgerQuery } from "../temporal/messages";
import { getTemporalHealth } from "../temporal/health-probe";
import { wrapWithBanner } from "../utils/banner";
import { formatToolOutput } from "../utils/tool-output";
import { formatStatusOutput } from "../utils/tool-formatters";
import {
  createDefaultGates,
  GATE_ORDER,
  isGateSatisfied,
  type GateId,
  type FeatureFlags,
  type ChangeRecency,
} from "../types";
import { getCommandsByGate } from "../manifest";
import { buildChangeContextSnapshot } from "../utils/context-snapshot";
import {
  loadProjectConfigWithDiagnostics,
  loadProposalWithFallback,
} from "../storage/json";
import { readProjectMetadata } from "../storage/project-metadata";
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

async function enrichRecentChangeStatus(
  rc: ChangeRecency,
  status: { recommendations: string[] },
  store: Store,
  clarifyMode: string,
): Promise<void> {
  const changeId = String(rc.id);
  const changeResult = await store.changes.get(changeId);
  if (!changeResult.success || !changeResult.data) return;

  const gates = changeResult.data.gates ?? createDefaultGates();
  const changeDir = join(store.paths.changes, changeId);
  const { content: proposalText } = await loadProposalWithFallback(
    changeDir,
    changeResult.data.title,
  );

  Object.assign(rc, {
    _contextSnapshot: buildChangeContextSnapshot({
      change: changeResult.data,
      proposalText,
      gates: gates ?? undefined,
      workdir: store.paths.root,
    }),
  });

  const nextGate = GATE_ORDER.find((gateId) => !isGateSatisfied(gates[gateId]));
  if (nextGate) {
    const rec = getRecommendationForGate(nextGate as GateId, changeId);
    if (rec) status.recommendations.push(rec);
  }

  appendClarifyRecommendation(
    status.recommendations,
    clarifyMode,
    changeResult.data,
    proposalText,
    changeId,
  );
  appendRecencyRecommendation(status.recommendations, rc, changeId);
}

function appendClarifyRecommendation(
  recommendations: string[],
  clarifyMode: string,
  change: Parameters<typeof runClarifyReadinessChecks>[0],
  proposalText: string,
  changeId?: string,
): void {
  const resolvedChangeId = changeId ?? change.id;
  if (clarifyMode === "off") return;

  const clarifyResult = runClarifyReadinessChecks(change, proposalText);
  if (clarifyResult.findings.length === 0) return;

  recommendations.push(
    `⚠️ Change \`${resolvedChangeId}\` has ${clarifyResult.findings.length} ambiguity finding(s) — run \`/adv-clarify ${resolvedChangeId}\` to resolve`,
  );
}

function appendRecencyRecommendation(
  recommendations: string[],
  rc: ChangeRecency,
  changeId: string,
): void {
  const recency = rc.recency;
  const minutesSinceActivity = Number(rc.minutesSinceActivity ?? 0);
  if (recency === "stale") {
    const hours = Math.floor(minutesSinceActivity / 60);
    const label =
      hours >= 24 ? `${Math.floor(hours / 24)}d ago` : `${hours}h ago`;
    recommendations.push(
      `⏰ Stale change \`${changeId}\` (last activity ${label}, ${rc.completedTasks}/${rc.taskCount} tasks done) — resume with \`/adv-apply ${changeId}\``,
    );
    return;
  }

  if (recency === "hot") {
    recommendations.push(
      `🔥 Change \`${changeId}\` is hot (active ${minutesSinceActivity}m ago) — likely in-flight by another agent`,
    );
  }
}

async function loadMigrationStatus(store: Store) {
  if (!store.paths.external) return null;

  const projectId = basename(store.paths.external);
  if (!projectId) return null;

  try {
    const address = getTemporalAddress(process.env);
    const reachable = await canReachTemporalAddress(address, 250);
    if (!reachable) return null;
    const bundle = await createTemporalClientBundle(process.env);
    try {
      const handle = bundle.client.workflow.getHandle(
        buildProjectWorkflowId(projectId),
      );
      const ledger = (await handle.query(
        projectMigrationLedgerQuery,
      )) as Array<{
        key?: string;
        source?: string;
        status?: string;
        detail?: string;
        recordedAt?: string;
      }>;
      const latest =
        [...ledger].reverse().find((entry) => entry.key === "project-import") ??
        ledger.at(-1) ??
        null;

      if (!latest) {
        return {
          project_id: projectId,
          status: "empty",
          source: null,
          detail: null,
          recorded_at: null,
        };
      }

      return {
        project_id: projectId,
        status: latest.status ?? "unknown",
        source: latest.source ?? null,
        detail: latest.detail ?? null,
        recorded_at: latest.recordedAt ?? null,
      };
    } finally {
      await bundle.connection.close().catch(() => undefined);
    }
  } catch {
    return null;
  }
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
      const temporalDisabled = process.env.ADV_DISABLE_TEMPORAL === "1";
      const migrationStatus = temporalDisabled
        ? null
        : await loadMigrationStatus(store);

      const projectId = store.paths.external
        ? basename(store.paths.external)
        : undefined;

      let temporalHealth;
      if (temporalDisabled) {
        temporalHealth = {
          server_alive: false,
          worker_alive: false,
          worker_process_alive: false,
          registered_queues: [],
          last_op_at: null,
          last_error: null,
          stale_queues: [],
        };
      } else {
        try {
          temporalHealth = await getTemporalHealth(projectId);
        } catch (err) {
          temporalHealth = {
            server_alive: false,
            worker_alive: false,
            worker_process_alive: false,
            registered_queues: [],
            last_op_at: null,
            last_error: err instanceof Error ? err.message : String(err),
            stale_queues: [],
          };
        }
      }

      if (temporalHealth.stale_queues && temporalHealth.stale_queues.length > 0) {
        for (const sq of temporalHealth.stale_queues) {
          status.recommendations.push(
            `⚠️ Stale Temporal queue \`${sq.queue}\` has ${sq.running_count} Running workflows older than 5 min with no local poller. See docs/temporal-recovery.md § "Stale workflows".`,
          );
        }
      }

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
        await enrichRecentChangeStatus(rc, status, store, clarifyMode);
      }

      const specsList = await store.specs.list();
      const requirementCount = specsList.specs.reduce(
        (sum, s) => sum + (s.requirementCount ?? 0),
        0,
      );

      const formatted = formatStatusOutput({
        specCount: status.specs.count,
        requirementCount,
        activeChanges: status.changes.recent.map((c) => ({
          id: c.id,
          title: c.title,
          minutesSinceActivity: c.minutesSinceActivity,
          recency: c.recency,
        })),
        archivedCount: status.changes.byStatus.archived ?? 0,
        recommendations: status.recommendations,
        temporalAlive: !!temporalHealth?.server_alive,
      });

      const projectMetadata = await readProjectMetadata(
        store.paths.root,
        store.paths.projectMetadata,
      );

      const output = {
        ...status,
        ...(featureFlags ? { feature_flags: featureFlags } : {}),
        temporal_health: temporalHealth,
        migration_status: migrationStatus,
        project_metadata: projectMetadata,
        formatted,
      };

      return wrapWithBanner(
        { command: "adv_status" },
        formatToolOutput(output),
      );
    },
  },
};
