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
import {
  createTemporalReadContext,
  isTemporalReadExpired,
  runTemporalRead,
  type TemporalReadContext,
} from "../storage/store-temporal/read-context";
import { getTemporalWorkerRole } from "../plugin-init";
import { STATUS_READ_DEADLINE_BUDGET_MS } from "../utils/tool-budgets";
import {
  classifyTemporalError,
  extractGrpcStatus,
  GRPC_NOT_FOUND,
  getTemporalRetryTelemetry,
} from "../temporal/retry-wrapper";
import { isWorkerAffirmativelyAlive } from "../temporal/health-probe";
import { formatToolOutput, resolveOutputMode } from "../utils/tool-output";
import { formatStatusOutput } from "../utils/tool-formatters";
import { listPeerSessions } from "./session/index";
import {
  type FeatureFlags,
  type ProjectStatus,
  type FeaturePolicySource,
  resolveProjectFeaturePolicy,
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
import { resolveRepoRoot } from "./archive-helpers/git-finalize";
import { getPluginRuntimeInfo } from "../utils/plugin-runtime-info";
import { type ProbeCacheFreshness } from "./probe-cache";
import { advWorktreeCleanup } from "./worktree";
import { readBacklog } from "../utils/backlog-store";
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
  appendResumeProjectionRecommendations,
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

function buildDeadlineDegradedStatus(status?: ProjectStatus): ProjectStatus {
  const warning = {
    code: "SOURCE_DEADLINE_EXCEEDED" as const,
    source: "workflow_query" as const,
    message:
      "Aggregate status read deadline exceeded; results are incomplete and must not be treated as complete.",
  };
  return {
    specs: status?.specs ?? { count: 0, capabilities: [] },
    changes: status?.changes ?? {
      active: 0,
      byStatus: { draft: 0, archived: 0, closed: 0 },
      recent: [],
    },
    recommendations: status?.recommendations ?? [],
    ...(status?.resolvedChanges
      ? { resolvedChanges: status.resolvedChanges }
      : {}),
    warnings: [
      ...(status?.warnings ?? []).filter(
        (existing) => existing.code !== warning.code,
      ),
      warning,
    ],
    hydrationStats: {
      ...(status?.hydrationStats ?? {}),
      deadlineExceeded: true,
      omitted: status?.hydrationStats?.omitted ?? 0,
      omittedIds: status?.hydrationStats?.omittedIds ?? [],
    },
  };
}

function buildDurableAbsenceStatus(): ProjectStatus {
  const warning = {
    code: "SOURCE_WORKFLOW_DURABLY_ABSENT" as const,
    source: "workflow_query" as const,
    message:
      "Temporal workflow is durably absent after a retained disk projection; status read stopped without retrying the unreachable workflow.",
  };
  return {
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
    recommendations: [],
    warnings: [warning],
    hydrationStats: { durableAbsence: true, omitted: 0 },
  };
}

async function loadStatusWithBootstrapRetry(
  store: Store,
  options?: StatusReadOptions,
  context: TemporalReadContext = createTemporalReadContext(),
): Promise<{
  status: ProjectStatus;
  bootstrapDiagnostic?: {
    recovered: boolean;
    lastErrorClass: "bootstrap_in_progress";
    error: string;
  };
}> {
  let lastBootstrapError: unknown;
  const projectionState = { loaded: false };
  const readOptions: StatusReadOptions | undefined =
    typeof store.hasLoadedDiskProjection === "function"
      ? { ...(options ?? {}), projectionState }
      : options;

  for (let attempt = 1; attempt <= STATUS_BOOTSTRAP_MAX_ATTEMPTS; attempt++) {
    if (isTemporalReadExpired(context)) {
      return {
        status: buildDeadlineDegradedStatus(),
        bootstrapDiagnostic: {
          recovered: false,
          lastErrorClass: "bootstrap_in_progress",
          error:
            "Aggregate status read deadline exceeded before the next attempt.",
        },
      };
    }
    try {
      const status = await store.status(readOptions);
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
      // A structurally identified gRPC NOT_FOUND is terminal once this store
      // has already loaded a durable disk projection. Do not use error text:
      // TMPRL1100 has no gRPC status and remains bootstrap-retry eligible.
      if (
        extractGrpcStatus(error) === GRPC_NOT_FOUND &&
        store.hasLoadedDiskProjection?.(projectionState) === true
      ) {
        return { status: buildDurableAbsenceStatus() };
      }
      lastBootstrapError = error;
      if (isTemporalReadExpired(context)) {
        return {
          status: buildDeadlineDegradedStatus(),
          bootstrapDiagnostic: {
            recovered: false,
            lastErrorClass: "bootstrap_in_progress",
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
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
// Future-work projection (AC5)
// =============================================================================

function hasContextPacket(packet: unknown): boolean {
  if (packet == null || typeof packet !== "object") return false;
  return Object.keys(packet).length > 0;
}

export interface FutureWorkProjection {
  shells: Array<{ id: string; title: string; has_context_packet: boolean }>;
  backlog: Array<{ id: string; title: string; has_context_packet: boolean }>;
}

async function buildFutureWorkProjection(
  store: Store,
): Promise<FutureWorkProjection> {
  const shells: FutureWorkProjection["shells"] = [];
  const backlog: FutureWorkProjection["backlog"] = [];

  try {
    const epics = await store.epics.list({ status: "active" });
    for (const epic of epics) {
      for (const entry of epic.entries ?? []) {
        if (entry.kind === "shell") {
          shells.push({
            id: entry.entry_id,
            title: entry.title,
            has_context_packet: hasContextPacket(entry.context_packet),
          });
        }
      }
    }
  } catch {
    // Best-effort: Epic query must not break status availability.
  }

  try {
    const backlogResult = await readBacklog(store.paths.root);
    for (const item of backlogResult.latestItems) {
      backlog.push({
        id: item.id,
        title: item.title,
        has_context_packet: hasContextPacket(item.context_packet),
      });
    }
  } catch {
    // Best-effort: backlog read must not break status availability.
  }

  return { shells, backlog };
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
          // One aggregate budget owns the entire authoritative status read.
          // Disk-backed target stores ignore this option, while Temporal-backed
          // stores use the absolute deadline for every source and hydration
          // stage rather than minting a fresh budget per view/call.
          // AC5: the status-local budget is derived from the host tool cap
          // minus a measured serialization headroom (tool-budgets.ts), so
          // changing either source constant cannot silently erase the margin.
          const temporalReadContext = createTemporalReadContext(
            STATUS_READ_DEADLINE_BUDGET_MS,
          );
          // Disk stores have no Temporal status path and intentionally retain
          // their legacy call shape; the deadline is meaningful only when the
          // Temporal backend exposes its summary projection reader.
          const supportsTemporalStatusRead =
            typeof activeStore.changes.listSummary === "function";
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
              ? {
                  recentLimit: STATUS_SUMMARY_RECENT_LIMIT,
                  ...(supportsTemporalStatusRead
                    ? { deadline: temporalReadContext.deadline }
                    : {}),
                }
              : view === "health"
                ? buildHealthStatusReadOptions(
                    healthRequest,
                    supportsTemporalStatusRead
                      ? temporalReadContext.deadline
                      : undefined,
                  )
                : supportsTemporalStatusRead
                  ? { deadline: temporalReadContext.deadline }
                  : undefined;
          const { status: loadedStatus, bootstrapDiagnostic } =
            await withRecordedPhase("adv_status", "statusLoad", () =>
              loadStatusWithBootstrapRetry(
                activeStore,
                statusReadOptions,
                temporalReadContext,
              ),
            );
          let status = loadedStatus;
          if (isTemporalReadExpired(temporalReadContext)) {
            status = buildDeadlineDegradedStatus(status);
          }
          // Request-local resolved documents: extracted for
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
          let migrationStatus:
            | Awaited<ReturnType<typeof loadMigrationStatus>>
            | null
            | undefined = null;

          const projectId = activeStore.paths.external
            ? basename(activeStore.paths.external)
            : undefined;

          const recentForCensus = status.changes.recent ?? [];
          const autoManagedCensus = computeAutoManagedCensus(
            recentForCensus as ReadonlyArray<{
              worktree_auto_managed?: boolean;
            }>,
          );

          const buildDegradedResponse = () => {
            const recommendationSummary = buildStatusRecommendationGroups(
              (status as StatusRecommendationCarrier).recommendation_items ??
                [],
              {
                perGroup:
                  view === "summary"
                    ? STATUS_SUMMARY_RECOMMENDATION_GROUP_LIMIT
                    : STATUS_DETAILED_RECOMMENDATION_GROUP_LIMIT,
              },
            );
            const formatted = formatStatusOutput({
              specCount: status.specs.count,
              requirementCount: 0,
              activeChanges: status.changes.recent.map((c) => ({
                id: c.id,
                title: c.title,
                minutesSinceActivity: c.minutesSinceActivity,
                parent_change_id: c.parent_change_id,
              })),
              archivedCount: status.changes.byStatus.archived ?? 0,
              recommendations: status.recommendations,
              recommendationSummary,
              temporalAlive: false,
              temporalDegraded: true,
              terminalCleanupRetained: { total: 0, classes: {} },
            });
            const degradedOutput = {
              ...status,
              feature_flags: {},
              feature_flag_sources: {},
              auto_managed_changes: autoManagedCensus,
              worker_role: getTemporalWorkerRole(),
              _freshness: {},
              _health_execution: {},
              temporal_health: undefined,
              orphan_queue_adoption: null,
              search_attributes: undefined,
              worker_processes: undefined,
              opencode_session_debt: undefined,
              migration_status: null,
              project_metadata: undefined,
              external_state_hygiene: undefined,
              worktree_census: undefined,
              terminal_cleanup_retained: { total: 0, classes: {} },
              snapshot_health: undefined,
              _healthSnapshot: undefined,
              archived_branch_hygiene: undefined,
              status_summary_omissions: summaryOmissions,
              recommendation_summary: recommendationSummary,
              recommendation_groups: recommendationSummary.groups,
              metrics: getMetrics(),
              plugin_runtime: undefined,
              formatted,
              ...(projectContext ? { _projectContext: projectContext } : {}),
            };
            return formatToolOutput(applyStatusView(degradedOutput, view), {
              pretty: resolveOutputMode(outputMode),
            });
          };

          const postStatusCutoffAt =
            statusReadOptions?.deadline?.deadlineAt ??
            temporalReadContext.deadline.deadlineAt;
          const postStatusBudgetExceeded = () =>
            isTemporalReadExpired(temporalReadContext) ||
            Date.now() >= postStatusCutoffAt;
          const degradeForDeadline = () => {
            status = buildDeadlineDegradedStatus(status);
            return buildDegradedResponse();
          };
          const runBoundedStatusPhase = async <T>(
            opType: string,
            operation: () => Promise<T>,
          ): Promise<
            | { kind: "complete"; data: T }
            | { kind: "deadline" }
            | { kind: "error"; error: unknown }
          > => {
            if (postStatusBudgetExceeded()) return { kind: "deadline" };
            const phaseRead = await runTemporalRead(
              undefined,
              operation,
              temporalReadContext,
              { maxAttempts: 1, opType },
            );
            if (!phaseRead.complete) {
              return postStatusBudgetExceeded()
                ? { kind: "deadline" }
                : { kind: "error", error: phaseRead.error };
            }
            if (postStatusBudgetExceeded()) return { kind: "deadline" };
            return { kind: "complete", data: phaseRead.data as T };
          };

          if (view === "hygiene") {
            const migrationRead = await runTemporalRead(
              undefined,
              () =>
                withRecordedPhase("adv_status", "migrationStatus", () =>
                  loadMigrationStatus(activeStore),
                ),
              temporalReadContext,
              { maxAttempts: 1, opType: "status.migrationStatus" },
            );
            if (!migrationRead.complete || postStatusBudgetExceeded()) {
              return degradeForDeadline();
            }
            migrationStatus = migrationRead.data;
          }

          // A status read that consumed its aggregate budget is already a
          // useful typed result. Do not enter view-specific enrichment/probe
          // stages after expiry: those stages have independent best-effort
          // work and could outlive the host safety cap while the caller has
          // already been told the authoritative read is incomplete.
          if (isTemporalReadExpired(temporalReadContext)) {
            return degradeForDeadline();
          }

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
            if (postStatusBudgetExceeded()) {
              return degradeForDeadline();
            }
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
                    if (postStatusBudgetExceeded()) {
                      break;
                    }
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
                    if (postStatusBudgetExceeded()) {
                      break;
                    }
                    const isPrimary = !primaryAssigned && rc.status === "draft";
                    if (isPrimary) primaryAssigned = true;
                    const enrichmentRead = await runTemporalRead(
                      undefined,
                      () =>
                        enrichRecentChangeStatus(
                          rc,
                          status,
                          activeStore,
                          clarifyMode,
                          isPrimary,
                          {
                            change: resolvedChanges?.get(String(rc.id)),
                            resolvedChanges,
                          },
                          { cutoffAt: postStatusCutoffAt },
                        ),
                      temporalReadContext,
                      { maxAttempts: 1, opType: "status.recentEnrichment" },
                    );
                    if (
                      !enrichmentRead.complete ||
                      postStatusBudgetExceeded()
                    ) {
                      break;
                    }
                  }
                }
              },
            );
            if (postStatusBudgetExceeded()) {
              return degradeForDeadline();
            }
          }

          if (plan.resumeProjection) {
            const resumeRead = await runTemporalRead(
              undefined,
              () =>
                withRecordedPhase("adv_status", "resumeProjection", () =>
                  appendResumeProjectionRecommendations(activeStore, status, {
                    projectId,
                    limit: 3,
                  }),
                ),
              temporalReadContext,
              { maxAttempts: 1, opType: "status.resumeProjection" },
            );
            if (!resumeRead.complete || postStatusBudgetExceeded()) {
              return degradeForDeadline();
            }
          }

          let probeFreshness: Record<string, ProbeCacheFreshness> = {};
          let temporalHealth: TemporalHealthSnapshot | undefined;
          let queueServiceability:
            | StatusQueueServiceabilitySnapshot
            | null
            | undefined;
          let workerProcesses: WorkerProcessesSnapshot | undefined;
          let searchAttributes: SearchAttributesSnapshot | undefined;
          let featureFlags: Record<string, unknown> = (() => {
            const policy = resolveProjectFeaturePolicy(undefined);
            return {
              worker_singleton_enforce: policy.worker_singleton_enforce.value,
              worktree_guard_enforce: policy.worktree_guard_enforce.value,
            };
          })();
          let rawFeatures: Record<string, unknown> | undefined;
          let featureFlagSources: Record<string, FeaturePolicySource> = {};
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
          let futureWorkProjection: FutureWorkProjection | undefined;

          if (view !== "health") {
            if (plan.temporalHealth) {
              try {
                const temporalProbeRead = await runBoundedStatusPhase(
                  "status.temporalHealth",
                  () =>
                    fetchStatusTemporalHealth(projectId, {
                      forceRefresh,
                    }),
                );
                if (temporalProbeRead.kind === "deadline") {
                  return degradeForDeadline();
                }
                if (temporalProbeRead.kind === "error") {
                  throw temporalProbeRead.error;
                }
                const temporalProbe = temporalProbeRead.data;
                temporalHealth = temporalProbe.value;
                probeFreshness.temporal_health = temporalProbe.freshness;
              } catch (err) {
                temporalHealth = buildTemporalHealthFallback(err);
                probeFreshness.temporal_health = {
                  cached_at: new Date().toISOString(),
                  // A degraded (timed-out) probe is NOT authoritative-fresh —
                  // liveness is unconfirmed, so callers should re-fetch rather
                  // than trust the optimistic fallback (no false "alive").
                  stale: true,
                  age_ms: 0,
                  ttl_ms: STATUS_PROBE_TTL_MS,
                  error: err instanceof Error ? err.message : String(err),
                };
              }
            }

            if (plan.queueServiceability && temporalHealth) {
              const queueServiceabilityRead = await runBoundedStatusPhase(
                "status.queueServiceability",
                () =>
                  fetchStatusQueueServiceability(
                    {
                      projectId,
                      health: temporalHealth!,
                    },
                    { forceRefresh },
                  ),
              );
              if (queueServiceabilityRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (queueServiceabilityRead.kind === "error") {
                throw queueServiceabilityRead.error;
              }
              const queueServiceabilityProbe = queueServiceabilityRead.data;
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
                const workerProcessesRead = await runBoundedStatusPhase(
                  "status.workerProcesses",
                  () => fetchStatusWorkerProcesses({ forceRefresh }),
                );
                if (workerProcessesRead.kind === "deadline") {
                  return degradeForDeadline();
                }
                if (workerProcessesRead.kind === "error") {
                  throw workerProcessesRead.error;
                }
                const workerProcessesProbe = workerProcessesRead.data;
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
              const searchAttributesRead = await runBoundedStatusPhase(
                "status.searchAttributes",
                () =>
                  statusSearchAttributesProbeCache.fetch(
                    projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
                    { forceRefresh },
                  ),
              );
              if (searchAttributesRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (searchAttributesRead.kind === "error") {
                throw searchAttributesRead.error;
              }
              const searchAttributesProbe = searchAttributesRead.data;
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
              const configRead = await runBoundedStatusPhase(
                "status.projectConfig",
                () => loadProjectConfigWithDiagnostics(activeStore.paths.root),
              );
              if (configRead.kind === "deadline") return degradeForDeadline();
              if (configRead.kind === "error") throw configRead.error;
              const configResult = configRead.data;

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
                const policy = resolveProjectFeaturePolicy(rawFeatures);
                featureFlags = {
                  ...(rawFeatures ?? {}),
                  worker_singleton_enforce:
                    policy.worker_singleton_enforce.value,
                  worktree_guard_enforce: policy.worktree_guard_enforce.value,
                };
                featureFlagSources = {
                  worker_singleton_enforce:
                    policy.worker_singleton_enforce.source,
                  worktree_guard_enforce: policy.worktree_guard_enforce.source,
                };
              }
            }

            for (const key of Object.keys(featureFlags)) {
              if (!(key in featureFlagSources)) {
                featureFlagSources[key] = "explicit";
              }
            }

            if (plan.worktreeCleanup) {
              const cleanupRead = await runBoundedStatusPhase(
                "status.worktreeCleanup",
                () =>
                  withRecordedPhase(
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
                  ),
              );
              if (cleanupRead.kind === "deadline") return degradeForDeadline();
              if (cleanupRead.kind === "error") throw cleanupRead.error;
            }

            if (plan.worktreeCensus) {
              const worktreeCensusRead = await runBoundedStatusPhase(
                "status.worktreeCensus",
                () =>
                  statusWorktreeCensusProbeCache.fetch(activeStore.paths.root, {
                    forceRefresh,
                  }),
              );
              if (worktreeCensusRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (worktreeCensusRead.kind === "error") {
                throw worktreeCensusRead.error;
              }
              const worktreeCensusProbe = worktreeCensusRead.data;
              worktreeCensus = worktreeCensusProbe.value;
              probeFreshness.worktree_census = worktreeCensusProbe.freshness;
            }

            if (plan.sessionDebt) {
              const sessionDebtRead = await runBoundedStatusPhase(
                "status.sessionDebt",
                () =>
                  withRecordedPhase("adv_status", "sessionDebtScan", () =>
                    scanOpenCodeSessionDebt(),
                  ),
              );
              if (sessionDebtRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (sessionDebtRead.kind === "error") {
                throw sessionDebtRead.error;
              }
              opencodeSessionDebt = sessionDebtRead.data;
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
              const healthSnapshotRead = await runBoundedStatusPhase(
                "status.healthSnapshot",
                () =>
                  withRecordedPhase("adv_status", "healthSnapshot", () =>
                    computeHealthSnapshot(activeStore),
                  ),
              );
              if (healthSnapshotRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (healthSnapshotRead.kind === "error") {
                throw healthSnapshotRead.error;
              }
              healthSnapshot = healthSnapshotRead.data;
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

            if (plan.externalStateHygiene) {
              const externalStateRead = await runBoundedStatusPhase(
                "status.externalStateHygiene",
                () => computeExternalStateHygiene(activeStore),
              );
              if (externalStateRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (externalStateRead.kind === "error") {
                throw externalStateRead.error;
              }
              externalStateHygiene = externalStateRead.data;
            }

            if (plan.archivedBranchHygiene) {
              try {
                const repoRoot = resolveRepoRoot(activeStore.paths.root);
                const hygieneStatus: StatusRecommendationCarrier & {
                  archived_branch_hygiene?: ArchivedBranchHygieneSection;
                } = {
                  recommendations: status.recommendations,
                  recommendation_items: (status as StatusRecommendationCarrier)
                    .recommendation_items,
                };
                const archivedHygieneRead = await runBoundedStatusPhase(
                  "status.archivedBranchHygiene",
                  () =>
                    appendArchivedBranchHygieneRecommendations(
                      hygieneStatus,
                      activeStore,
                      repoRoot,
                    ),
                );
                if (archivedHygieneRead.kind === "deadline") {
                  return degradeForDeadline();
                }
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
              const snapshotHealthRead = await runTemporalRead(
                undefined,
                () =>
                  withRecordedPhase("adv_status", "snapshotHealth", () =>
                    fetchStatusSnapshotHealth(projectId, { forceRefresh }),
                  ),
                temporalReadContext,
                { maxAttempts: 1, opType: "status.snapshotHealth" },
              );
              if (
                !snapshotHealthRead.complete ||
                !snapshotHealthRead.data ||
                postStatusBudgetExceeded()
              ) {
                status = buildDeadlineDegradedStatus(status);
                return buildDegradedResponse();
              }
              const snapshotHealthProbe = snapshotHealthRead.data;
              snapshotHealth = snapshotHealthProbe.value;
              probeFreshness.snapshot_health = snapshotHealthProbe.freshness;
            }

            if (plan.specRequirementCount) {
              const specsRead = await runTemporalRead(
                undefined,
                () => activeStore.specs.list(),
                temporalReadContext,
                { maxAttempts: 1, opType: "status.specs" },
              );
              if (
                !specsRead.complete ||
                !specsRead.data ||
                postStatusBudgetExceeded()
              ) {
                status = buildDeadlineDegradedStatus(status);
                return buildDegradedResponse();
              }
              const specsList = specsRead.data;
              requirementCount = specsList.specs.reduce(
                (sum, s) => sum + (s.requirementCount ?? 0),
                0,
              );
            }

            if (plan.peerSessions) {
              try {
                const peerRead = await runBoundedStatusPhase(
                  "status.peerSessions",
                  () =>
                    listPeerSessions({
                      projectRoot: activeStore.paths.root,
                    }),
                );
                if (peerRead.kind === "deadline") {
                  return degradeForDeadline();
                }
                if (peerRead.kind === "error") throw peerRead.error;
                const peerResult = peerRead.data;
                if (peerResult.unavailable) {
                  peerSessions = { unavailable: true };
                } else {
                  peerSessions = peerResult.sessions;
                }
              } catch {
                peerSessions = { unavailable: true };
              }
            }

            if (plan.pluginRuntime) {
              const pluginRuntimeRead = await runBoundedStatusPhase(
                "status.pluginRuntime",
                () => getPluginRuntimeInfo(),
              );
              if (pluginRuntimeRead.kind === "deadline") {
                return degradeForDeadline();
              }
              if (pluginRuntimeRead.kind === "error") {
                throw pluginRuntimeRead.error;
              }
              pluginRuntimeInfo = pluginRuntimeRead.data;
            }
          } else {
            const healthRead = await runBoundedStatusPhase(
              "status.health",
              () =>
                runHealthStatus({
                  store: activeStore,
                  projectId,
                  forceRefresh,
                  autoManagedCensus,
                  request: healthRequest!,
                  loadMigrationStatus: () => loadMigrationStatus(activeStore),
                }),
            );
            if (healthRead.kind === "deadline") {
              return degradeForDeadline();
            }
            if (healthRead.kind === "error") throw healthRead.error;
            const healthResult = healthRead.data;

            temporalHealth = healthResult.temporal_health;
            queueServiceability = healthResult.temporal_queue_serviceability
              ? {
                  expectedQueue: healthResult.expected_queue ?? "",
                  serviceability: healthResult.temporal_queue_serviceability,
                  workerDiagnostics: healthResult.worker_diagnostics ?? [],
                  orphanQueueAdoption: healthResult.orphan_queue_adoption,
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
                temporalDegraded: temporalHealth?.probe_degraded === true,
                temporalHealth: temporalHealth
                  ? {
                      worker_alive: temporalHealth.worker_alive,
                      worker_process_alive: temporalHealth.worker_process_alive,
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

          let projectMetadata:
            | Awaited<ReturnType<typeof readProjectMetadata>>
            | undefined;
          if (plan.projectMetadata) {
            const projectMetadataRead = await runBoundedStatusPhase(
              "status.projectMetadata",
              () =>
                readProjectMetadata(
                  activeStore.paths.root,
                  activeStore.paths.projectMetadata,
                ),
            );
            if (projectMetadataRead.kind === "deadline") {
              return degradeForDeadline();
            }
            if (projectMetadataRead.kind === "error") {
              throw projectMetadataRead.error;
            }
            projectMetadata = projectMetadataRead.data;
          }

          if (plan.futureWork) {
            const futureWorkRead = await runBoundedStatusPhase(
              "status.futureWorkProjection",
              () =>
                withRecordedPhase("adv_status", "futureWorkProjection", () =>
                  buildFutureWorkProjection(activeStore),
                ),
            );
            if (futureWorkRead.kind === "deadline") {
              return degradeForDeadline();
            }
            if (futureWorkRead.kind === "error") throw futureWorkRead.error;
            futureWorkProjection = futureWorkRead.data;
          }

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
            orphan_queue_adoption:
              queueServiceability?.orphanQueueAdoption ?? null,
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
            ...(futureWorkProjection
              ? { future_work: futureWorkProjection }
              : {}),
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
              temporalWorker:
                temporalHealth?.worker_alive?.status === "unavailable"
                  ? ("unknown" as const)
                  : isWorkerAffirmativelyAlive(
                        temporalHealth?.worker_alive ?? {
                          status: "available",
                          value: false,
                        },
                      )
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
