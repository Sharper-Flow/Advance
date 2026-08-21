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
import { STATUS_READ_DEADLINE_BUDGET_MS } from "../utils/tool-budgets";
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
  statusWorktreeCensusProbeCache,
  _healthSnapshotCache,
  _statusProbeCaches,
  type HealthSnapshot,
  type SnapshotHealthSnapshot,
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

async function loadStatusWithBootstrapRetry(
  store: Store,
  options?: StatusReadOptions,
): Promise<{
  status: ProjectStatus;
}> {
  const projectionState = { loaded: false };
  const readOptions: StatusReadOptions | undefined =
    typeof store.hasLoadedDiskProjection === "function"
      ? { ...(options ?? {}), projectionState }
      : options;
  return { status: await store.status(readOptions) };
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
      "`health` returns disk, worktree, session-debt, and metrics diagnostics; " +
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
            "`health` surfaces disk/worktree/session-debt detail + metrics counters; " +
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
          // The aggregate read budget is absolute from tool entry: the host
          // kills the invocation at DEFAULT_TOOL_TIMEOUT_MS regardless of
          // internal progress, so every phase — including the status load
          // below — must share one clock that starts before the first read.
          // Late phases are cut off mid-flight so the composed degraded
          // response still fits inside the host cap.
          const postStatusCutoffAt =
            Date.now() + STATUS_READ_DEADLINE_BUDGET_MS;
          const postStatusBudgetExceeded = () =>
            Date.now() >= postStatusCutoffAt;
          // One aggregate budget owns the entire authoritative status read.
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
                }
              : view === "health"
                ? buildHealthStatusReadOptions()
                : undefined;
          const { status: loadedStatus } = await withRecordedPhase(
            "adv_status",
            "statusLoad",
            () => loadStatusWithBootstrapRetry(activeStore, statusReadOptions),
          );
          const status = loadedStatus;
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
              storeAvailable: true,
              terminalCleanupRetained: { total: 0, classes: {} },
            });
            const degradedOutput = {
              ...status,
              feature_flags: {},
              feature_flag_sources: {},
              auto_managed_changes: autoManagedCensus,
              _freshness: {},
              _health_execution: {},
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

          const degradeForDeadline = () => {
            return buildDegradedResponse();
          };
          // Phases race the aggregate cutoff rather than only checking it
          // between phases: a single long phase (resume projection, a wedged
          // enrichment read) must not hold the invocation past the cutoff and
          // let the host safety net win over the typed degraded response.
          // A phase that loses the race may still settle afterwards; the
          // degraded response is serialized synchronously from current state,
          // so late settlement cannot alter the returned payload.
          const runBoundedStatusPhase = async <T>(
            _opType: string,
            operation: () => Promise<T>,
          ): Promise<
            | { kind: "complete"; data: T }
            | { kind: "deadline" }
            | { kind: "error"; error: unknown }
          > => {
            if (postStatusBudgetExceeded()) return { kind: "deadline" };
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
              const raced = await Promise.race([
                Promise.resolve(operation()).then(
                  (data) => ({ kind: "complete" as const, data }),
                  (error: unknown) => ({ kind: "error" as const, error }),
                ),
                new Promise<{ kind: "deadline" }>((resolve) => {
                  timer = setTimeout(
                    () => resolve({ kind: "deadline" }),
                    Math.max(0, postStatusCutoffAt - Date.now()),
                  );
                }),
              ]);
              if (raced.kind === "complete" && postStatusBudgetExceeded()) {
                return { kind: "deadline" };
              }
              return raced;
            } finally {
              if (timer !== undefined) clearTimeout(timer);
            }
          };

          if (view === "hygiene") {
            const migrationRead = await runBoundedStatusPhase(
              "status.migrationStatus",
              () =>
                withRecordedPhase("adv_status", "migrationStatus", () =>
                  loadMigrationStatus(activeStore),
                ),
            );
            if (migrationRead.kind !== "complete") {
              return degradeForDeadline();
            }
            migrationStatus = migrationRead.data;
          }

          // A status read that consumed its aggregate budget is already a
          // useful typed result. Do not enter view-specific enrichment/probe
          // stages after expiry: those stages have independent best-effort
          // work and could outlive the host safety cap while the caller has
          // already been told the authoritative read is incomplete.
          if (postStatusBudgetExceeded()) {
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
                  const cutoffAt = postStatusCutoffAt;
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
                    const enrichmentRead = await runBoundedStatusPhase(
                      "status.recentEnrichment",
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
                    );
                    if (
                      enrichmentRead.kind !== "complete" ||
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
            const resumeRead = await runBoundedStatusPhase(
              "status.resumeProjection",
              () =>
                withRecordedPhase("adv_status", "resumeProjection", () =>
                  appendResumeProjectionRecommendations(activeStore, status, {
                    projectId,
                    limit: 3,
                  }),
                ),
            );
            if (resumeRead.kind !== "complete") {
              return degradeForDeadline();
            }
          }

          let probeFreshness: Record<string, ProbeCacheFreshness> = {};
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
              const snapshotHealthRead = await runBoundedStatusPhase(
                "status.snapshotHealth",
                () =>
                  withRecordedPhase("adv_status", "snapshotHealth", () =>
                    fetchStatusSnapshotHealth(projectId, { forceRefresh }),
                  ),
              );
              if (snapshotHealthRead.kind !== "complete") {
                return degradeForDeadline();
              }
              const snapshotHealthProbe = snapshotHealthRead.data;
              snapshotHealth = snapshotHealthProbe.value;
              probeFreshness.snapshot_health = snapshotHealthProbe.freshness;
            }

            if (plan.specRequirementCount) {
              const specsRead = await runBoundedStatusPhase(
                "status.specs",
                () => activeStore.specs.list(),
              );
              if (specsRead.kind !== "complete") {
                return degradeForDeadline();
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
                storeAvailable: true,
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
            _freshness: probeFreshness,
            _health_execution: healthExecution,
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
            diagnostics: {},
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
