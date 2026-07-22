/**
 * Status Tool
 *
 * Project-wide status overview with manifest-driven recommendations.
 * Uses the workflow manifest to recommend next commands based on
 * gate status of active changes.
 */
import { basename } from "path";
import type { Store } from "../storage/store";
import type { StatusReadOptions } from "../storage/store-types";
import { getTemporalWorkerRole } from "../plugin-init";
import {
  classifyTemporalError,
  getTemporalRetryTelemetry,
} from "../temporal/retry-wrapper";
import { formatToolOutput, resolveOutputMode } from "../utils/tool-output";
import { formatStatusOutput } from "../utils/tool-formatters";
import { listPeerSessions } from "./session/index";
import {
  type FeatureFlags,
  type ProjectStatus,
  withStabilityFeatureDefaults,
} from "../types";
import { loadProjectConfigWithDiagnostics } from "../storage/json";
import { readProjectMetadata } from "../storage/project-metadata";
import { getMetrics, withRecordedPhase } from "../utils/metrics";
import { scanOpenCodeSessionDebt } from "../utils/opencode-session-debt";
import { getToolSchemaManifest } from "../utils/tool-schema-telemetry";
import { getCacheTokenTelemetry } from "../utils/cache-token-telemetry";
import type { ToolSchemaProjection } from "../utils/tool-schema-projection";
import { z } from "zod";
import { withOptionalTargetPathStore } from "./target-project";
import { resolveMainCheckout } from "./archive-helpers/git-finalize";
import { getPluginRuntimeInfo } from "../utils/plugin-runtime-info";
import { type ProbeCacheFreshness } from "./probe-cache";
import { advWorktreeCleanup } from "./worktree";
import {
  getPendingDeletes,
  initStateDb as initWorktreeStateDb,
  summarizePendingDeletes,
  type PendingDeleteSummary,
} from "./worktree/state";
import { buildStatusRecommendationGroups } from "./status-recommendations";
import {
  computeHealthSnapshot,
  fetchStatusSnapshotHealth,
  fetchStatusTemporalHealth,
  fetchStatusQueueServiceability,
  fetchStatusWorkerProcesses,
  buildTemporalHealthFallback,
  STATUS_PROBE_TTL_MS,
  pushQueueServiceabilityRecommendations,
  statusSearchAttributesProbeCache,
  statusWorktreeCensusProbeCache,
  _healthSnapshotCache,
  _statusProbeCaches,
  MISSING_PROJECT_ID_CACHE_KEY,
  type HealthSnapshot,
  type SearchAttributesSnapshot,
  type SnapshotHealthSnapshot,
  type StatusQueueServiceabilitySnapshot,
  type TemporalHealthSnapshot,
  type WorkerProcessesSnapshot,
  type WorktreeCensusSnapshot,
} from "./status-health";
import {
  computeExternalStateHygiene,
  appendArchivedBranchHygieneRecommendations,
  computeAutoManagedCensus,
  deriveOpencodeDebtCounts,
  type ArchivedBranchHygieneSection,
} from "./status-hygiene";
import {
  applyCandidateEnrichmentPatches,
  buildCandidateEnrichmentPatch,
  enrichRecentChangeStatus,
  filterRecentChangesForProductScope,
  buildProductContextOutput,
  capRecommendations,
  pushStatusRecommendation,
  type StatusSummaryOmissions,
  type StatusRecommendationCarrier,
  type CandidateEnrichmentPatch,
} from "./status-enrich";
import { buildStatusViewPlan, applyStatusView } from "./status-view";
import {
  runHealthStatus,
  createHealthRequestContext,
  buildHealthStatusReadOptions,
  buildHealthExecutionMeta,
} from "./status-health-plan";
export { _test } from "./status-enrich";
export { _healthSnapshotCache, _statusProbeCaches } from "./status-health";
export { resetStatusHealthForTest } from "./status-health-test-reset";
export {
  computeAutoManagedCensus,
  deriveOpencodeDebtCounts,
} from "./status-hygiene";
export type { AdvStatusView } from "./status-view";

// rq-advStatusBoundedSummary01: summary must bound compute before enrichment
// and bound output recommendations with omitted-count metadata.
const STATUS_SUMMARY_RECENT_LIMIT = 10;
const STATUS_SUMMARY_RECOMMENDATION_LIMIT = 10;
const STATUS_DETAILED_RECOMMENDATION_LIMIT = 50;
const STATUS_SUMMARY_RECOMMENDATION_GROUP_LIMIT = 2;
const STATUS_DETAILED_RECOMMENDATION_GROUP_LIMIT = 5;

function capSummaryRecommendations(status: {
  recommendations: string[];
}): number {
  return capRecommendations(
    status,
    STATUS_SUMMARY_RECOMMENDATION_LIMIT,
    "summary",
  );
}

async function loadMigrationStatus(_store: Store) {
  // Migration ledger retired with projectWorkflow.
  return null;
}

const STATUS_BOOTSTRAP_RETRY_DELAY_MS = 50;
const STATUS_BOOTSTRAP_MAX_ATTEMPTS = 3;

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadStatusWithBootstrapRetry(
  store: Store,
  options?: StatusReadOptions,
): Promise<{
  status: ProjectStatus;
  bootstrapDiagnostic?: {
    recovered: boolean;
    lastErrorClass: "bootstrap_in_progress";
    error: string;
  };
}> {
  let lastBootstrapError: unknown;

  for (let attempt = 1; attempt <= STATUS_BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
    try {
      const status = await store.status(options);
      return lastBootstrapError
        ? {
            status,
            bootstrapDiagnostic: {
              recovered: true,
              lastErrorClass: "bootstrap_in_progress",
              error:
                lastBootstrapError instanceof Error
                  ? lastBootstrapError.message
                  : String(lastBootstrapError),
            },
          }
        : { status };
    } catch (error) {
      if (classifyTemporalError(error) !== "fallback") throw error;
      lastBootstrapError = error;
      if (attempt < STATUS_BOOTSTRAP_MAX_ATTEMPTS) {
        await delay(STATUS_BOOTSTRAP_RETRY_DELAY_MS);
      }
    }
  }

  const error =
    lastBootstrapError instanceof Error
      ? lastBootstrapError.message
      : String(lastBootstrapError);
  return {
    status: {
      specs: { count: 0, capabilities: [] },
      changes: {
        active: 0,
        byStatus: {
          draft: 0,
          archived: 0,
          closed: 0,
        },
        recent: [],
      },
      recommendations: [
        "⚠️ Temporal bootstrap in progress — status read hit replay recovery errors repeatedly; retry shortly.",
      ],
    },
    bootstrapDiagnostic: {
      recovered: false,
      lastErrorClass: "bootstrap_in_progress",
      error,
    },
  };
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
      scope: z
        .enum(["repo", "product"])
        .optional()
        .default("repo")
        .describe(
          "Product-linked visibility scope. `repo` (default) shows changes scoped to the current repo; `product` shows all product changes.",
        ),
      forceRefresh: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Refresh advisory status health probe caches for the selected view. Does not refresh or cache gate/task/change/contract/archive truth.",
        ),
      outputMode: z
        .enum(["compact", "pretty"])
        .optional()
        .describe(
          "Output mode: compact (default) or pretty. Overrides ADV_TOOL_OUTPUT_MODE env var for this call.",
        ),
    },
    execute: async (
      {
        target_path,
        view = "summary",
        scope = "repo",
        forceRefresh = false,
        outputMode,
      }: {
        target_path?: string;
        view?: "summary" | "health" | "changes" | "hygiene";
        scope?: "repo" | "product";
        forceRefresh?: boolean;
        outputMode?: "compact" | "pretty";
      },
      store: Store,
    ) => {
      return withOptionalTargetPathStore(
        { store, target_path },
        async (activeStore, projectContext) => {
          const plan = buildStatusViewPlan(view);
          const healthRequest =
            view === "health" ? createHealthRequestContext() : undefined;
          const summaryOmissions: StatusSummaryOmissions = {
            recentChanges: 0,
            recommendations: 0,
          };
          // fixChangeListTimeouts KD4 / AC3: the summary bound travels
          // into the status read BEFORE deep per-change hydration, not
          // only as an output slice afterwards. Full views pass no bound
          // and keep complete resolution semantics under the shared
          // per-call aggregate deadline.
          // rq-summaryReadBound01: summary applies STATUS_SUMMARY_RECENT_LIMIT
          // before non-required deep hydration/artifact reads/enrichment and
          // reuses request-local resolved documents instead of re-reading them.
          const statusReadOptions: StatusReadOptions | undefined =
            view === "summary"
              ? { recentLimit: STATUS_SUMMARY_RECENT_LIMIT }
              : view === "health"
                ? buildHealthStatusReadOptions(healthRequest)
                : undefined;
          const { status, bootstrapDiagnostic } = await withRecordedPhase(
            "adv_status",
            "statusLoad",
            () => loadStatusWithBootstrapRetry(activeStore, statusReadOptions),
          );
          // Request-local resolved documents (AC4): extracted for
          // enrichment reuse and stripped before output serialization —
          // the map is transport-only, never response payload.
          const resolvedChanges = status.resolvedChanges;
          if (resolvedChanges !== undefined) {
            delete status.resolvedChanges;
          }
          // Typed degradation must be visible in every view (C2): surface
          // resolver warnings as recommendations so a bounded/deadline-
          // truncated status can never look complete.
          for (const warning of status.warnings ?? []) {
            pushStatusRecommendation(status, {
              kind: "health",
              priority: "high",
              title: "Status read incomplete",
              detail: warning.message,
              action: "retry `adv_status` or query the named changes directly",
              source: "health",
              message: `⚠️ Status read incomplete — ${warning.message}`,
            });
          }
          const migrationStatus =
            view === "hygiene"
              ? await withRecordedPhase("adv_status", "migrationStatus", () =>
                  loadMigrationStatus(activeStore),
                )
              : null;

          const projectId = activeStore.paths.external
            ? basename(activeStore.paths.external)
            : undefined;

          const recentForCensus = status.changes.recent ?? [];
          const autoManagedCensus = computeAutoManagedCensus(
            recentForCensus as ReadonlyArray<{
              worktree_auto_managed?: boolean;
            }>,
          );

          if (plan.recentEnrichment) {
            let recentChanges = await withRecordedPhase(
              "adv_status",
              "recentChangeScopeFilter",
              () =>
                filterRecentChangesForProductScope(
                  status.changes.recent ?? [],
                  activeStore,
                  scope,
                  resolvedChanges,
                ),
            );
            if (
              view === "summary" &&
              recentChanges.length > STATUS_SUMMARY_RECENT_LIMIT
            ) {
              summaryOmissions.recentChanges =
                recentChanges.length - STATUS_SUMMARY_RECENT_LIMIT;
              recentChanges = recentChanges.slice(
                0,
                STATUS_SUMMARY_RECENT_LIMIT,
              );
            }
            status.changes.recent = recentChanges;
            const features = activeStore.config?.features as
              | FeatureFlags
              | undefined;
            const clarifyMode = features?.clarify_enforcement ?? "advisory";

            await withRecordedPhase(
              "adv_status",
              "recentChangeEnrichment",
              async () => {
                let primaryAssigned = false;
                if (view === "health") {
                  const cutoffAt =
                    statusReadOptions?.deadline?.deadlineAt ??
                    Date.now() + 7_500;
                  const patches: CandidateEnrichmentPatch[] = [];
                  let rank = 0;
                  for (const rc of recentChanges) {
                    const isPrimary = !primaryAssigned && rc.status === "draft";
                    if (isPrimary) primaryAssigned = true;
                    const patch = await buildCandidateEnrichmentPatch({
                      rc,
                      store: activeStore,
                      clarifyMode,
                      isPrimary,
                      resolved: {
                        change: resolvedChanges?.get(String(rc.id)),
                        resolvedChanges,
                      },
                      cutoffAt,
                      rank,
                    });
                    patches.push(patch);
                    rank++;
                  }
                  applyCandidateEnrichmentPatches({
                    patches,
                    candidates: recentChanges,
                    status,
                  });
                } else {
                  for (const rc of recentChanges) {
                    const isPrimary = !primaryAssigned && rc.status === "draft";
                    if (isPrimary) primaryAssigned = true;
                    await enrichRecentChangeStatus(
                      rc,
                      status,
                      activeStore,
                      clarifyMode,
                      isPrimary,
                      {
                        change: resolvedChanges?.get(String(rc.id)),
                        resolvedChanges,
                      },
                    );
                  }
                }
              },
            );
          }

          let probeFreshness: Record<string, ProbeCacheFreshness> = {};
          let temporalHealth: TemporalHealthSnapshot | undefined;
          let queueServiceability:
            | StatusQueueServiceabilitySnapshot
            | null
            | undefined;
          let workerProcesses: WorkerProcessesSnapshot | undefined;
          let searchAttributes: SearchAttributesSnapshot | undefined;
          let featureFlags: Record<string, unknown> =
            withStabilityFeatureDefaults(undefined);
          let rawFeatures: Record<string, unknown> | undefined;
          let featureFlagSources: Record<string, "default" | "explicit"> = {};
          let terminalCleanupRetained: PendingDeleteSummary = {
            total: 0,
            classes: {},
          };
          let worktreeCensus: WorktreeCensusSnapshot | undefined;
          let opencodeSessionDebt: Awaited<
            ReturnType<typeof scanOpenCodeSessionDebt>
          > | null = null;
          let opencodeDebtCounts: {
            orphanGhost: number;
            liveInFlight: number;
            idleActiveSession: number;
            repairableToolPart: number;
            liveToolPart: number;
            idleToolPart: number;
          } | null = null;
          let healthSnapshot: HealthSnapshot | undefined;
          let externalStateHygiene:
            | Awaited<ReturnType<typeof computeExternalStateHygiene>>
            | undefined;
          let archivedBranchHygiene: ArchivedBranchHygieneSection | undefined;
          let snapshotHealth: SnapshotHealthSnapshot | undefined;
          let requirementCount = 0;
          let healthMigrationStatus: unknown = null;
          let peerSessions:
            | Array<{
                sessionId: string;
                startedAt: string;
                worktree: string;
                isSelf: boolean;
              }>
            | { unavailable: true }
            | undefined;
          let pluginRuntimeInfo:
            | Awaited<ReturnType<typeof getPluginRuntimeInfo>>
            | undefined;
          let healthExecution: Record<string, unknown> | undefined;
          let toolLaneProjections:
            | Record<string, ToolSchemaProjection>
            | undefined;

          if (view !== "health") {
            if (plan.temporalHealth) {
              try {
                const temporalProbe = await fetchStatusTemporalHealth(
                  projectId,
                  {
                    forceRefresh,
                  },
                );
                temporalHealth = temporalProbe.value;
                probeFreshness.temporal_health = temporalProbe.freshness;
              } catch (err) {
                temporalHealth = buildTemporalHealthFallback(err);
                probeFreshness.temporal_health = {
                  cached_at: new Date().toISOString(),
                  stale: true,
                  age_ms: 0,
                  ttl_ms: STATUS_PROBE_TTL_MS,
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            }

            if (plan.queueServiceability && temporalHealth) {
              const queueServiceabilityProbe =
                await fetchStatusQueueServiceability(
                  {
                    projectId,
                    health: temporalHealth,
                  },
                  { forceRefresh },
                );
              queueServiceability = queueServiceabilityProbe.value;
              probeFreshness.queue_serviceability =
                queueServiceabilityProbe.freshness;

              pushQueueServiceabilityRecommendations({
                status,
                temporalHealth,
                queueServiceability,
              });
            }

            if (plan.workerProcesses) {
              try {
                const workerProcessesProbe = await fetchStatusWorkerProcesses({
                  forceRefresh,
                });
                workerProcesses = workerProcessesProbe.value;
                probeFreshness.worker_processes =
                  workerProcessesProbe.freshness;
              } catch (err) {
                workerProcesses = undefined;
                probeFreshness.worker_processes = {
                  cached_at: new Date().toISOString(),
                  stale: true,
                  age_ms: 0,
                  ttl_ms: STATUS_PROBE_TTL_MS,
                  error: err instanceof Error ? err.message : String(err),
                };
              }

              if (workerProcesses && workerProcesses.orphanCount > 0) {
                const orphanPids = workerProcesses.processes
                  .filter((p) => p.orphan)
                  .map((p) => p.pid)
                  .slice(0, 5);
                const message =
                  `⚠️ ${workerProcesses.orphanCount} orphaned ADV Temporal worker process(es) detected ` +
                  `(pid ${orphanPids.join(", ")}${workerProcesses.orphanCount > orphanPids.length ? ", …" : ""}) — ` +
                  "parent plugin-host is gone; kill them to stop task-queue saturation.";
                pushStatusRecommendation(status, {
                  kind: "health",
                  priority: "high",
                  title: "Orphaned ADV worker process(es)",
                  detail: `${workerProcesses.orphanCount} worker process(es) whose parent is dead`,
                  action: `kill ${orphanPids.join(" ")} — or see docs/temporal-recovery.md`,
                  source: "health",
                  message,
                });
              }
            }

            if (plan.searchAttributes) {
              const searchAttributesProbe =
                await statusSearchAttributesProbeCache.fetch(
                  projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
                  { forceRefresh },
                );
              searchAttributes = searchAttributesProbe.value;
              probeFreshness.search_attributes =
                searchAttributesProbe.freshness;

              if (!searchAttributes.ok) {
                const message =
                  "⚠️ Temporal search attributes not verified — " +
                  "run `adv_doctor` to register missing search attributes.";
                pushStatusRecommendation(status, {
                  kind: "health",
                  priority: "high",
                  title: "Temporal search attributes not verified",
                  detail: "required search attributes may be missing",
                  action:
                    "run `adv_doctor` to register missing search attributes",
                  source: "health",
                  message,
                });
              }
            }

            if (plan.projectConfig) {
              const configResult = await loadProjectConfigWithDiagnostics(
                activeStore.paths.root,
              );

              if (!activeStore.paths.external) {
                status.recommendations.unshift(
                  "⚠️  Running without external state — ADV state is stored in-repo (.adv/). " +
                    "Worktree sharing and state isolation are unavailable. " +
                    "Ensure OpenCode is started from a git repository.",
                );
              }

              if (!configResult.success) {
                const prefix =
                  configResult.type === "not_found"
                    ? "⚠️  Config warning"
                    : "❌ Config error";
                status.recommendations.unshift(
                  `${prefix}: ${configResult.error}`,
                );
              } else {
                rawFeatures = configResult.data.features as
                  | Record<string, unknown>
                  | undefined;
                featureFlags = withStabilityFeatureDefaults(rawFeatures);
              }
            }

            for (const key of Object.keys(featureFlags)) {
              featureFlagSources[key] =
                rawFeatures && typeof rawFeatures[key] !== "undefined"
                  ? "explicit"
                  : "default";
            }

            if (plan.worktreeCleanup) {
              await withRecordedPhase(
                "adv_status",
                "worktreeCleanup",
                async () => {
                  try {
                    const worktreeAccess = await initWorktreeStateDb(
                      activeStore.paths.root,
                    );
                    await advWorktreeCleanup("status", {
                      projectRoot: activeStore.paths.root,
                      database: worktreeAccess,
                      log: {
                        debug: () => undefined,
                        info: () => undefined,
                        warn: () => undefined,
                        error: () => undefined,
                      },
                      store: activeStore,
                      forceAttempts: false,
                    });
                    terminalCleanupRetained = summarizePendingDeletes(
                      await getPendingDeletes(worktreeAccess),
                    );
                  } catch {
                    // Status cleanup discovery is best-effort; status itself must remain available.
                  }
                },
              );
            }

            if (plan.worktreeCensus) {
              const worktreeCensusProbe =
                await statusWorktreeCensusProbeCache.fetch(
                  activeStore.paths.root,
                  { forceRefresh },
                );
              worktreeCensus = worktreeCensusProbe.value;
              probeFreshness.worktree_census = worktreeCensusProbe.freshness;
            }

            if (plan.sessionDebt) {
              opencodeSessionDebt = await withRecordedPhase(
                "adv_status",
                "sessionDebtScan",
                () => scanOpenCodeSessionDebt(),
              );
              opencodeDebtCounts =
                deriveOpencodeDebtCounts(opencodeSessionDebt);
              if (
                opencodeSessionDebt.available &&
                opencodeDebtCounts &&
                (opencodeDebtCounts.orphanGhost > 0 ||
                  opencodeDebtCounts.repairableToolPart > 0)
              ) {
                const message = `[doctor] OpenCode blank assistant session debt detected (${opencodeDebtCounts.orphanGhost} orphan ghost blank assistant row(s), ${opencodeDebtCounts.repairableToolPart} repairable stale tool part row(s)) — run \`bun scripts/opencode-session-doctor.ts --dry-run\` to classify live vs orphan rows before any cleanup.`;
                pushStatusRecommendation(status, {
                  kind: "cleanup",
                  priority: "medium",
                  title: "OpenCode session debt detected",
                  detail: `${opencodeDebtCounts.orphanGhost} orphan ghost row(s), ${opencodeDebtCounts.repairableToolPart} stale tool part row(s)`,
                  action:
                    "run `bun scripts/opencode-session-doctor.ts --dry-run` to classify live vs orphan rows",
                  source: "session_debt",
                  message,
                });
              }
            }

            if (plan.healthSnapshot) {
              healthSnapshot = await withRecordedPhase(
                "adv_status",
                "healthSnapshot",
                () => computeHealthSnapshot(activeStore),
              );
              if (healthSnapshot.closed_to_active_ratio > 5) {
                const ratio = healthSnapshot.closed_to_active_ratio;
                const message = `⚠️  Closed-change disk leak detected (ratio ${ratio}:1). Run \`adv_cleanup\` to inspect stale changes.`;
                pushStatusRecommendation(status, {
                  kind: "cleanup",
                  priority: "medium",
                  title: "Closed-change disk leak detected",
                  detail: `ratio ${ratio}:1`,
                  action: "Run `adv_cleanup` to inspect stale changes",
                  source: "session_debt",
                  message,
                });
              }
            }

            externalStateHygiene = plan.externalStateHygiene
              ? await computeExternalStateHygiene(activeStore)
              : undefined;

            if (plan.archivedBranchHygiene) {
              try {
                const mainCheckout = resolveMainCheckout(
                  activeStore.paths.root,
                );
                const hygieneStatus: StatusRecommendationCarrier & {
                  archived_branch_hygiene?: ArchivedBranchHygieneSection;
                } = {
                  recommendations: status.recommendations,
                  recommendation_items: (status as StatusRecommendationCarrier)
                    .recommendation_items,
                };
                await appendArchivedBranchHygieneRecommendations(
                  hygieneStatus,
                  activeStore,
                  mainCheckout,
                );
                status.recommendations = hygieneStatus.recommendations;
                (status as StatusRecommendationCarrier).recommendation_items =
                  hygieneStatus.recommendation_items;
                archivedBranchHygiene = hygieneStatus.archived_branch_hygiene;
              } catch {
                // Archived branch hygiene is advisory and git-backed. Non-git
                // project fixtures and degraded runtimes must still get status.
              }
            }

            if (plan.snapshotHealth) {
              const snapshotHealthProbe = await withRecordedPhase(
                "adv_status",
                "snapshotHealth",
                () => fetchStatusSnapshotHealth(projectId, { forceRefresh }),
              );
              snapshotHealth = snapshotHealthProbe.value;
              probeFreshness.snapshot_health = snapshotHealthProbe.freshness;
            }

            if (plan.specRequirementCount) {
              const specsList = await activeStore.specs.list();
              requirementCount = specsList.specs.reduce(
                (sum, s) => sum + (s.requirementCount ?? 0),
                0,
              );
            }

            if (plan.peerSessions) {
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
            }

            pluginRuntimeInfo = plan.pluginRuntime
              ? await getPluginRuntimeInfo()
              : undefined;
          } else {
            const healthResult = await runHealthStatus({
              store: activeStore,
              projectId,
              forceRefresh,
              autoManagedCensus,
              request: healthRequest!,
              loadMigrationStatus: () => loadMigrationStatus(activeStore),
            });

            temporalHealth = healthResult.temporal_health;
            queueServiceability = healthResult.temporal_queue_serviceability
              ? {
                  expectedQueue: healthResult.expected_queue ?? "",
                  serviceability: healthResult.temporal_queue_serviceability,
                  workerDiagnostics: healthResult.worker_diagnostics ?? [],
                }
              : undefined;
            workerProcesses = healthResult.worker_processes;
            searchAttributes = healthResult.search_attributes;
            featureFlags = healthResult.feature_flags;
            featureFlagSources = healthResult.feature_flag_sources;
            terminalCleanupRetained = healthResult.terminal_cleanup_retained;
            worktreeCensus = healthResult.worktree_census;
            snapshotHealth = healthResult.snapshot_health;
            peerSessions = healthResult.peer_sessions;
            pluginRuntimeInfo = healthResult.plugin_runtime as Awaited<
              ReturnType<typeof getPluginRuntimeInfo>
            >;
            probeFreshness = healthResult._freshness;
            requirementCount = healthResult.requirement_count;
            healthMigrationStatus = healthResult.migration_status;
            healthExecution = buildHealthExecutionMeta(
              status,
              healthResult._health_execution,
            );
            toolLaneProjections = healthResult.tool_lane_projections;

            if (queueServiceability && temporalHealth) {
              pushQueueServiceabilityRecommendations({
                status,
                temporalHealth,
                queueServiceability,
              });
            }

            if (workerProcesses && workerProcesses.orphanCount > 0) {
              const orphanPids = workerProcesses.processes
                .filter((p) => p.orphan)
                .map((p) => p.pid)
                .slice(0, 5);
              const message =
                `⚠️ ${workerProcesses.orphanCount} orphaned ADV Temporal worker process(es) detected ` +
                `(pid ${orphanPids.join(", ")}${workerProcesses.orphanCount > orphanPids.length ? ", …" : ""}) — ` +
                "parent plugin-host is gone; kill them to stop task-queue saturation.";
              pushStatusRecommendation(status, {
                kind: "health",
                priority: "high",
                title: "Orphaned ADV worker process(es)",
                detail: `${workerProcesses.orphanCount} worker process(es) whose parent is dead`,
                action: `kill ${orphanPids.join(" ")} — or see docs/temporal-recovery.md`,
                source: "health",
                message,
              });
            }

            if (searchAttributes && !searchAttributes.ok) {
              const message =
                "⚠️ Temporal search attributes not verified — " +
                "run `adv_doctor` to register missing search attributes.";
              pushStatusRecommendation(status, {
                kind: "health",
                priority: "high",
                title: "Temporal search attributes not verified",
                detail: "required search attributes may be missing",
                action:
                  "run `adv_doctor` to register missing search attributes",
                source: "health",
                message,
              });
            }
          }

          const recommendationSummary = buildStatusRecommendationGroups(
            (status as StatusRecommendationCarrier).recommendation_items ?? [],
            {
              perGroup:
                view === "summary"
                  ? STATUS_SUMMARY_RECOMMENDATION_GROUP_LIMIT
                  : STATUS_DETAILED_RECOMMENDATION_GROUP_LIMIT,
            },
          );

          if (view === "summary") {
            summaryOmissions.recommendations =
              capSummaryRecommendations(status);
          } else {
            summaryOmissions.recommendations = capRecommendations(
              status,
              STATUS_DETAILED_RECOMMENDATION_LIMIT,
              view,
            );
          }

          const formatted = await withRecordedPhase(
            "adv_status",
            "formatOutput",
            async () =>
              formatStatusOutput({
                specCount: status.specs.count,
                requirementCount,
                activeChanges: status.changes.recent.map((c) => ({
                  id: c.id,
                  title: c.title,
                  minutesSinceActivity: c.minutesSinceActivity,
                  parent_change_id: c.parent_change_id,
                  epic: (
                    c as {
                      epic?: { id: string; title: string; entry_id: string };
                    }
                  ).epic,
                })),
                archivedCount: status.changes.byStatus.archived ?? 0,
                recommendations: status.recommendations,
                recommendationSummary,
                temporalAlive: !!temporalHealth?.server_alive,
                temporalHealth: temporalHealth
                  ? {
                      worker_alive: temporalHealth.worker_alive ?? false,
                      worker_process_alive:
                        temporalHealth.worker_process_alive ?? false,
                      worker_lock: temporalHealth.worker_lock ?? null,
                      last_worker_run_error:
                        temporalHealth.last_worker_run_error ?? null,
                    }
                  : undefined,
                temporalQueueServiceability:
                  queueServiceability?.serviceability ?? null,
                pluginRuntime: pluginRuntimeInfo
                  ? {
                      source_dist_freshness:
                        pluginRuntimeInfo.source_dist_freshness,
                      recovery_hint: pluginRuntimeInfo.recovery_hint,
                      plugin_bundle_freshness:
                        pluginRuntimeInfo.plugin_bundle_freshness,
                      loaded_plugin_generation:
                        pluginRuntimeInfo.loaded_plugin_generation,
                      deployed_plugin_generation:
                        pluginRuntimeInfo.deployed_plugin_generation,
                      plugin_bundle_recovery:
                        pluginRuntimeInfo.plugin_bundle_recovery,
                    }
                  : undefined,
                worktreeCensus: worktreeCensus
                  ? {
                      total: worktreeCensus.total,
                      stale: worktreeCensus.stale,
                    }
                  : undefined,
                terminalCleanupRetained,
                peerSessions,
                opencodeSessionDebt:
                  opencodeSessionDebt && opencodeSessionDebt.available
                    ? {
                        available: true,
                        orphanGhostCount: opencodeDebtCounts?.orphanGhost ?? 0,
                        liveInFlightCount:
                          opencodeDebtCounts?.liveInFlight ?? 0,
                        idleActiveSessionCount:
                          opencodeDebtCounts?.idleActiveSession ?? 0,
                        repairableToolPartCount:
                          opencodeDebtCounts?.repairableToolPart ?? 0,
                        liveToolPartCount:
                          opencodeDebtCounts?.liveToolPart ?? 0,
                        idleToolPartCount:
                          opencodeDebtCounts?.idleToolPart ?? 0,
                      }
                    : opencodeSessionDebt
                      ? {
                          available: false,
                          reason: opencodeSessionDebt.reason,
                        }
                      : undefined,
                snapshotHealth: snapshotHealth
                  ? {
                      critical: snapshotHealth.summary.critical,
                      warnings: snapshotHealth.summary.warnings,
                      info: snapshotHealth.summary.info,
                    }
                  : undefined,
              }),
          );
          if (view === "summary") {
            formatted.healthSection = "";
            formatted.worktreeSection = "";
            formatted.sessionDebtSection = "";
            formatted.peerSessionsSection = "";
          } else if (view === "health") {
            formatted.sessionDebtSection = "";
          }

          const projectMetadata = plan.projectMetadata
            ? await readProjectMetadata(
                activeStore.paths.root,
                activeStore.paths.projectMetadata,
              )
            : undefined;

          // T4: tool-context telemetry is only required for the health view.
          // Lane-permission probes ran under the request-owned bounded health
          // execution plan; static telemetry here only reads retained state.
          const toolContextTelemetry =
            view === "health"
              ? {
                  manifest: getToolSchemaManifest(),
                  lane_projections: toolLaneProjections ?? {},
                  cache_tokens: getCacheTokenTelemetry(),
                  limitations: [
                    "Live per-request MCP tool counts are unavailable without upstream OpenCode support.",
                  ],
                }
              : undefined;

          const fullOutput = {
            ...status,
            ...(buildProductContextOutput(activeStore, scope)
              ? {
                  product_context: buildProductContextOutput(
                    activeStore,
                    scope,
                  ),
                }
              : {}),
            feature_flags: featureFlags,
            feature_flag_sources: featureFlagSources,
            auto_managed_changes: autoManagedCensus,
            worker_role: getTemporalWorkerRole(),
            _freshness: probeFreshness,
            _health_execution: healthExecution,
            temporal_health: temporalHealth,
            ...(queueServiceability
              ? {
                  expected_queue: queueServiceability.expectedQueue,
                  temporal_queue_serviceability:
                    queueServiceability.serviceability,
                  worker_diagnostics: queueServiceability.workerDiagnostics,
                }
              : {}),
            search_attributes: searchAttributes,
            worker_processes: workerProcesses,
            opencode_session_debt: opencodeSessionDebt,
            migration_status:
              view === "health" ? healthMigrationStatus : migrationStatus,
            project_metadata: projectMetadata,
            external_state_hygiene: externalStateHygiene,
            worktree_census: worktreeCensus,
            terminal_cleanup_retained: terminalCleanupRetained,
            snapshot_health: snapshotHealth,
            _healthSnapshot: healthSnapshot,
            archived_branch_hygiene: archivedBranchHygiene,
            status_summary_omissions: summaryOmissions,
            recommendation_summary: recommendationSummary,
            recommendation_groups: recommendationSummary.groups,
            // AC6: in-memory counters surfaced via view: "health".
            // Counters reset on plugin init (JC-1).
            metrics: getMetrics(),
            // T4: tool-context telemetry (init-time schema manifest + numeric
            // cache-token samples). Live per-request MCP tool counts require
            // upstream OpenCode support and are intentionally not available.
            ...(toolContextTelemetry
              ? { tool_context_telemetry: toolContextTelemetry }
              : {}),
            plugin_runtime: pluginRuntimeInfo,
            diagnostics: {
              temporalWorker: temporalHealth?.worker_alive
                ? ("healthy" as const)
                : temporalHealth?.server_alive
                  ? ("degraded" as const)
                  : ("unknown" as const),
              lastErrorClass:
                bootstrapDiagnostic?.recovered === false
                  ? bootstrapDiagnostic.lastErrorClass
                  : (getTemporalRetryTelemetry().lastError ?? undefined),
            },
            ...(bootstrapDiagnostic
              ? { bootstrap_retry: bootstrapDiagnostic }
              : {}),
            formatted,
            ...(projectContext ? { _projectContext: projectContext } : {}),
          };

          const output = applyStatusView(fullOutput, view);
          return formatToolOutput(output, {
            pretty: resolveOutputMode(outputMode),
          });
        },
      );
    },
  },
};
