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
import { getTemporalFallbackTelemetry } from "../temporal/fallback-telemetry";
import { getTemporalRetryTelemetry } from "../temporal/retry-wrapper";
import { getStslStats, isStslInitialized } from "../temporal/service";
import { formatToolOutput } from "../utils/tool-output";
import { formatStatusOutput } from "../utils/tool-formatters";
import { listPeerSessions } from "./session/index";
import {
  createDefaultGates,
  GATE_ORDER,
  isGateSatisfied,
  type GateId,
  type FeatureFlags,
  type ChangeRecency,
} from "../types";
import { getCommandsByGate } from "../manifest";
import {
  buildChangeContextSnapshot,
  buildChangeContextTicker,
} from "../utils/context-snapshot";
import {
  loadProjectConfigWithDiagnostics,
  loadProposalWithFallback,
} from "../storage/json";
import { readProjectMetadata } from "../storage/project-metadata";
import { getWorktreeCensus } from "../utils/worktree-census";
import { scanOpenCodeSessionDebt } from "../utils/opencode-session-debt";
import { runClarifyReadinessChecks } from "../validator/clarify-readiness";
import { z } from "zod";
import { withOptionalTargetPathStore } from "./target-project";
import { buildExternalDependencyStatus } from "./external-dependency-status";
import { listChangeDirs, loadChange } from "../storage/json";
import { archiveBundleExists } from "../archive/archive";

// =============================================================================
// Health Snapshot Cache
// =============================================================================

const HEALTH_SNAPSHOT_TTL_MS = 30000;

interface HealthSnapshot {
  leaked_source_dirs: number;
  leaked_archived_source_dirs: number;
  archive_dirs: number;
  closed_to_active_ratio: number;
}

const healthSnapshotCache = new Map<
  string,
  { snapshot: HealthSnapshot; computedAt: number }
>();

/** Exported for test isolation only */
export const _healthSnapshotCache = healthSnapshotCache;

async function computeHealthSnapshot(store: Store): Promise<HealthSnapshot> {
  const cacheKey = store.paths.external
    ? basename(store.paths.external)
    : store.paths.root;

  const cached = healthSnapshotCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.computedAt < HEALTH_SNAPSHOT_TTL_MS) {
    return cached.snapshot;
  }

  const changesDir = store.paths.changes;
  const archiveDir = store.paths.archive;

  const [changeIds, archiveIds] = await Promise.all([
    listChangeDirs(changesDir),
    listChangeDirs(archiveDir),
  ]);

  let leakedSourceDirs = 0;
  let leakedArchivedSourceDirs = 0;
  let closedCount = 0;
  let activeCount = 0;

  await Promise.all(
    changeIds.map(async (id) => {
      const result = await loadChange(changesDir, id);
      if (!result.success || !result.data) return;

      const status = result.data.status;
      if (status === "closed") {
        closedCount++;
        const hasArchive = await archiveBundleExists(archiveDir, id);
        if (!hasArchive) {
          leakedSourceDirs++;
        }
      } else if (status === "archived") {
        leakedArchivedSourceDirs++;
      } else if (status === "active") {
        activeCount++;
      }
    }),
  );

  const snapshot: HealthSnapshot = {
    leaked_source_dirs: leakedSourceDirs,
    leaked_archived_source_dirs: leakedArchivedSourceDirs,
    archive_dirs: archiveIds.length,
    closed_to_active_ratio:
      Math.round((closedCount / Math.max(activeCount, 1)) * 100) / 100,
  };

  healthSnapshotCache.set(cacheKey, { snapshot, computedAt: now });
  return snapshot;
}

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
  parentContext?: string,
): string | null {
  const cmds = getCommandsByGate(gateId);
  if (cmds.length === 0) {
    return null;
  }

  // Pick the first (primary) command for this gate
  const cmd = cmds[0];
  const label = parentContext
    ? `Change \`${changeId}\` (fast-follow of \`${parentContext}\`)`
    : `Change \`${changeId}\``;
  return `${label}: next gate is \`${gateId}\` → run \`/${cmd.name} ${changeId}\``;
}

async function getFastFollowParentContext(
  store: Store,
  parentChangeId: string,
): Promise<string> {
  const parent = await store.changes.get(parentChangeId);
  if (parent.success && parent.data) {
    const terminal =
      parent.data.status === "archived" || parent.data.status === "closed";
    return terminal
      ? `${parentChangeId} (${parent.data.status})`
      : parentChangeId;
  }
  return parentChangeId;
}

async function enrichRecentChangeStatus(
  rc: ChangeRecency,
  status: { recommendations: string[] },
  store: Store,
  clarifyMode: string,
  isPrimary: boolean,
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

  const snapshotInput = {
    change: changeResult.data,
    proposalText,
    gates: gates ?? undefined,
    workdir: store.paths.root,
  };

  Object.assign(rc, {
    parent_change_id: changeResult.data.fast_follow_of?.parent_change_id,
    _contextSnapshot: isPrimary
      ? buildChangeContextSnapshot(snapshotInput)
      : buildChangeContextTicker(snapshotInput),
  });

  const dependencyStatus = await buildExternalDependencyStatus(
    changeResult.data.external_dependencies,
  );
  if (dependencyStatus) {
    (rc as unknown as Record<string, unknown>)._externalDependencyStatus =
      dependencyStatus.summary;
  }

  const nextGate = GATE_ORDER.find((gateId) => !isGateSatisfied(gates[gateId]));
  if (nextGate) {
    const parentContext = changeResult.data.fast_follow_of
      ? await getFastFollowParentContext(
          store,
          changeResult.data.fast_follow_of.parent_change_id,
        )
      : undefined;
    const rec = getRecommendationForGate(
      nextGate as GateId,
      changeId,
      parentContext,
    );
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

  // Suppress clarify recommendations once every gate is satisfied — the change
  // is archive-eligible (or already archived) and ambiguity findings are no
  // longer actionable. See GH issue #14.
  const gates = change.gates;
  if (gates && GATE_ORDER.every((g) => isGateSatisfied(gates[g]))) return;

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
// View Filter
// =============================================================================

/** Status output view selector type — exported for shared typing.
 *  rq-advStatusView01. */
export type AdvStatusView = "summary" | "health" | "changes" | "hygiene";

/**
 * Apply the view filter to the full status output.
 *
 * The full output is built unconditionally (the cost of computing it is
 * dominated by the tool's underlying queries, not by serialization). The
 * filter scopes the response shape per `view`. `formatted` is preserved
 * across all views since it is the human-readable summary block.
 *
 * Field selection per design spec:
 *   - summary  (default): specs count + recent changes (id+title+recency
 *                         only) + recommendations + temporal_health.ok
 *                         (boolean) + worktree count + formatted.
 *   - health             : full temporal_health + search_attributes +
 *                         opencode_session_debt + diagnostics + metrics
 *                         counters (placeholder until AC6 lands).
 *   - changes            : full status.changes detail (recent + byStatus).
 *   - hygiene            : recommendations full + opencode_session_debt
 *                         detail + project_metadata + _healthSnapshot
 *                         (closed-vs-active leak signals).
 */
export function applyStatusView(
  full: Record<string, unknown>,
  view: AdvStatusView,
): Record<string, unknown> {
  const projection: Record<string, unknown> = {
    formatted: full.formatted,
    ...(full._projectContext ? { _projectContext: full._projectContext } : {}),
    view,
  };

  const changesObj = full.changes as
    | {
        recent?: Array<{
          id: string;
          title: string;
          recency?: unknown;
          minutesSinceActivity?: number;
        }>;
        byStatus?: Record<string, number>;
      }
    | undefined;
  const temporalHealth = full.temporal_health as
    | { server_alive?: boolean }
    | undefined;
  const worktreeCensus = full.worktree_census as
    | { total?: number }
    | undefined;
  const specs = full.specs as { count?: number } | undefined;

  switch (view) {
    case "summary": {
      projection.specs = { count: specs?.count };
      projection.changes = {
        recent: (changesObj?.recent ?? []).map((c) => ({
          id: c.id,
          title: c.title,
          recency: c.recency,
          minutesSinceActivity: c.minutesSinceActivity,
        })),
      };
      projection.recommendations = full.recommendations ?? [];
      projection.temporal_health_ok = !!temporalHealth?.server_alive;
      projection.worktree_count = worktreeCensus?.total ?? 0;
      break;
    }
    case "health": {
      projection.temporal_health = full.temporal_health;
      projection.search_attributes = full.search_attributes;
      projection.opencode_session_debt = full.opencode_session_debt;
      projection.diagnostics = full.diagnostics;
      // Metrics counters surface here once AC6 lands.
      if (full.metrics) projection.metrics = full.metrics;
      break;
    }
    case "changes": {
      projection.changes = full.changes;
      projection.recommendations = full.recommendations ?? [];
      break;
    }
    case "hygiene": {
      projection.recommendations = full.recommendations ?? [];
      projection.opencode_session_debt = full.opencode_session_debt;
      projection.project_metadata = full.project_metadata;
      projection._healthSnapshot = full._healthSnapshot;
      projection.migration_status = full.migration_status;
      break;
    }
  }

  return projection;
}

// =============================================================================
// Tool Definitions
// =============================================================================

// rq-advcfg01: Status Config Diagnostics and Feature Flags
//
// rq-advStatusView01 — adv_status accepts an optional view selector that
// scopes the response to one of four lenses (summary / health / changes /
// hygiene). The default "summary" view omits the hygiene-archaeology fields
// that bloat the response when callers only need orientation.
export const statusTools = {
  adv_status: {
    description:
      "Show project overview: specs, active changes, and next-step recommendations. " +
      "Use the optional `view` selector to scope the response: " +
      "`summary` (default) returns lightweight orientation; " +
      "`health` returns full Temporal/STSL/session-debt diagnostics + metrics; " +
      "`changes` returns full active-change detail; " +
      "`hygiene` returns leak detection + recommendations + project metadata.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, reads that project as a disk snapshot and returns _projectContext.",
        ),
      view: z
        .enum(["summary", "health", "changes", "hygiene"])
        .optional()
        .default("summary")
        .describe(
          "Output view selector. `summary` (default) omits hygiene archaeology and full diagnostics; " +
            "`health` surfaces Temporal/STSL/session-debt detail + metrics counters; " +
            "`changes` returns the full recent-change list; " +
            "`hygiene` surfaces archived/closed leaks + recommendations + project metadata.",
        ),
    },
    execute: async (
      {
        target_path,
        view = "summary",
      }: {
        target_path?: string;
        view?: "summary" | "health" | "changes" | "hygiene";
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const status = await activeStore.status();
          const migrationStatus = await loadMigrationStatus(activeStore);

          const projectId = activeStore.paths.external
            ? basename(activeStore.paths.external)
            : undefined;

          let temporalHealth;
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
              fallback_counts: getTemporalFallbackTelemetry(),
              stale_queues: [],
              reconnect_count: 0,
            };
          }

          if (temporalHealth.stale_queues.length > 0) {
            for (const sq of temporalHealth.stale_queues) {
              status.recommendations.push(
                `⚠️ Stale Temporal queue \`${sq.queue}\` has ${sq.running_count} Running workflows older than 5 min with no local poller. See docs/temporal-recovery.md § "Stale \`adv/change/*\` and \`adv/project/*\` workflows".`,
              );
            }
          }

          // Search attributes health from STSL cache
          const stslStats = getStslStats();
          const stslReady = isStslInitialized();
          let searchAttributes: {
            ok: boolean;
            checkedAt?: number;
            error?: string;
          };
          if (!stslReady) {
            searchAttributes = {
              ok: false,
              error: "STSL not initialized",
            };
          } else if (stslStats.saVerification) {
            searchAttributes = {
              ok: stslStats.saVerification.ok,
              checkedAt: stslStats.saVerification.checkedAt,
            };
          } else {
            searchAttributes = { ok: false, error: "Not yet verified" };
          }

          if (!searchAttributes.ok) {
            status.recommendations.push(
              "⚠️ Temporal search attributes not verified — " +
                "run `adv_temporal_register_search_attributes` to register missing search attributes.",
            );
          }

          // Load project config with diagnostics — surface errors instead of silently ignoring
          const configResult = await loadProjectConfigWithDiagnostics(
            activeStore.paths.root,
          );
          let featureFlags: Record<string, unknown> | undefined;

          // Warn when external state is unavailable — worktree sharing and
          // state isolation won't function.  This happens when the plugin
          // directory is not inside a git repo and no project.path fallback
          // was available (e.g. GUI clients starting from $HOME).
          if (!activeStore.paths.external) {
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
            featureFlags = configResult.data.features as Record<
              string,
              boolean
            >;
          }

          // Single-pass over recent changes: context snapshot, gate recommendation,
          // clarify readiness, and recency labels — all built in one traversal.
          // First active/draft/pending change gets full-box snapshot; others get ticker.
          const recentChanges = status.changes.recent ?? [];
          const features = activeStore.config?.features as
            | FeatureFlags
            | undefined;
          const clarifyMode = features?.clarify_enforcement ?? "advisory";

          let primaryAssigned = false;
          for (const rc of recentChanges) {
            const isPrimary =
              !primaryAssigned &&
              (rc.status === "active" ||
                rc.status === "draft" ||
                rc.status === "pending");
            if (isPrimary) primaryAssigned = true;
            await enrichRecentChangeStatus(
              rc,
              status,
              activeStore,
              clarifyMode,
              isPrimary,
            );
          }

          // Worktree census
          const worktreeCensus = await getWorktreeCensus(
            activeStore.paths.root,
          );

          const opencodeSessionDebt = await scanOpenCodeSessionDebt();
          if (
            opencodeSessionDebt.available &&
            opencodeSessionDebt.repairable_stale.length > 0
          ) {
            status.recommendations.push(
              `[doctor] Stale OpenCode blank assistant messages detected (${opencodeSessionDebt.repairable_stale.length} sample(s), ${opencodeSessionDebt.total_blank} total blank row(s)) — run \`bun scripts/opencode-session-doctor.ts --dry-run\` before deletion.`,
            );
          }

          const healthSnapshot = await computeHealthSnapshot(activeStore);
          if (healthSnapshot.closed_to_active_ratio > 5) {
            const ratio = healthSnapshot.closed_to_active_ratio;
            status.recommendations.push(
              `⚠️  Closed-change disk leak detected (ratio ${ratio}:1). Run \`adv_archive_sweep_orphans dryRun: true includeClosed: true\` to inspect.`,
            );
          }

          const specsList = await activeStore.specs.list();
          const requirementCount = specsList.specs.reduce(
            (sum, s) => sum + (s.requirementCount ?? 0),
            0,
          );

          // T22: Peer Sessions — read session_registry, project to public
          // schema, apply PID-liveness filter. Best-effort: any error
          // surfaces as "unavailable".
          let peerSessions:
            | Array<{
                sessionId: string;
                startedAt: string;
                worktree: string;
                isSelf: boolean;
              }>
            | { unavailable: true };
          try {
            const peerResult = await listPeerSessions({
              projectRoot: activeStore.paths.root,
            });
            if (peerResult.unavailable) {
              peerSessions = { unavailable: true };
            } else {
              peerSessions = peerResult.sessions;
            }
          } catch {
            peerSessions = { unavailable: true };
          }

          const formatted = formatStatusOutput({
            specCount: status.specs.count,
            requirementCount,
            activeChanges: status.changes.recent.map((c) => ({
              id: c.id,
              title: c.title,
              minutesSinceActivity: c.minutesSinceActivity,
              recency: c.recency,
              parent_change_id: c.parent_change_id,
            })),
            archivedCount: status.changes.byStatus.archived ?? 0,
            recommendations: status.recommendations,
            temporalAlive: !!temporalHealth?.server_alive,
            worktreeCensus: worktreeCensus
              ? {
                  total: worktreeCensus.total,
                  stale: worktreeCensus.stale,
                }
              : undefined,
            peerSessions,
            opencodeSessionDebt: opencodeSessionDebt.available
              ? {
                  available: true,
                  repairableStaleCount:
                    opencodeSessionDebt.repairable_stale.length,
                  liveInFlightCount: opencodeSessionDebt.live_in_flight.length,
                }
              : {
                  available: false,
                  reason: opencodeSessionDebt.reason,
                },
          });

          const projectMetadata = await readProjectMetadata(
            activeStore.paths.root,
            activeStore.paths.projectMetadata,
          );

          const fullOutput = {
            ...status,
            ...(featureFlags ? { feature_flags: featureFlags } : {}),
            temporal_health: temporalHealth,
            search_attributes: searchAttributes,
            opencode_session_debt: opencodeSessionDebt,
            migration_status: migrationStatus,
            project_metadata: projectMetadata,
            worktree_census: worktreeCensus,
            _healthSnapshot: healthSnapshot,
            diagnostics: {
              temporalWorker: temporalHealth?.worker_alive
                ? ("healthy" as const)
                : temporalHealth?.server_alive
                  ? ("degraded" as const)
                  : ("unknown" as const),
              lastErrorClass:
                getTemporalRetryTelemetry().lastError ?? undefined,
            },
            formatted,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };

          const output = applyStatusView(fullOutput, view);
          return formatToolOutput(output);
        },
      );
    },
  },
};
