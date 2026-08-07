/**
 * status-view
 *
 * Extracted from status.ts — pure move, no behavior change.
 */

import { type StatusRecommendationSummary } from "./status-recommendations";

// =============================================================================
// View Filter
// =============================================================================

/** Status output view selector type — exported for shared typing.
 *  rq-advStatusView01. */
export type AdvStatusView = "summary" | "health" | "changes" | "hygiene";

export interface StatusViewPlan {
  searchAttributes: boolean;
  workerProcesses: boolean;
  projectConfig: boolean;
  recentEnrichment: boolean;
  worktreeCleanup: boolean;
  worktreeCensus: boolean;
  sessionDebt: boolean;
  healthSnapshot: boolean;
  externalStateHygiene: boolean;
  snapshotHealth: boolean;
  specRequirementCount: boolean;
  peerSessions: boolean;
  pluginRuntime: boolean;
  projectMetadata: boolean;
  archivedBranchHygiene: boolean;
  resumeProjection: boolean;
  futureWork: boolean;
}

// rq-advStatusLazyView01 (advance-meta v1.12) — execute providers from
// the selected view plan rather than computing every diagnostic and
// projecting after the fact. Summary must skip detailed providers and
// must keep `_contextSnapshot` emission unchanged.
export function buildStatusViewPlan(view: AdvStatusView): StatusViewPlan {
  switch (view) {
    case "summary":
      return {
        searchAttributes: false,
        workerProcesses: false,
        projectConfig: false,
        recentEnrichment: true,
        worktreeCleanup: false,
        worktreeCensus: false,
        sessionDebt: false,
        healthSnapshot: false,
        externalStateHygiene: false,
        snapshotHealth: false,
        specRequirementCount: true,
        peerSessions: false,
        pluginRuntime: false,
        projectMetadata: false,
        archivedBranchHygiene: false,
        resumeProjection: true,
        futureWork: true,
      };
    case "health":
      return {
        searchAttributes: true,
        workerProcesses: true,
        projectConfig: true,
        recentEnrichment: true,
        worktreeCleanup: false,
        worktreeCensus: true,
        sessionDebt: false,
        healthSnapshot: false,
        externalStateHygiene: false,
        snapshotHealth: true,
        specRequirementCount: true,
        peerSessions: true,
        pluginRuntime: true,
        projectMetadata: false,
        archivedBranchHygiene: false,
        resumeProjection: true,
        // future_work (Epic/backlog inventory) is excluded from the health
        // view: health is a strictly time-budgeted diagnostics path
        // (status-health-integration-blockers A.1 enforces an 8,000 ms
        // wall-clock budget). buildFutureWorkProjection reads Epic shells +
        // backlog outside that budget and would breach it. future_work is
        // still surfaced via the summary and hygiene views (AC5).
        futureWork: false,
      };
    case "changes":
      return {
        searchAttributes: false,
        workerProcesses: false,
        projectConfig: false,
        recentEnrichment: true,
        worktreeCleanup: false,
        worktreeCensus: false,
        sessionDebt: false,
        healthSnapshot: false,
        externalStateHygiene: false,
        snapshotHealth: false,
        specRequirementCount: true,
        peerSessions: false,
        pluginRuntime: false,
        projectMetadata: false,
        archivedBranchHygiene: false,
        resumeProjection: false,
        futureWork: false,
      };
    case "hygiene":
      return {
        searchAttributes: false,
        workerProcesses: false,
        projectConfig: true,
        recentEnrichment: true,
        worktreeCleanup: true,
        worktreeCensus: true,
        sessionDebt: true,
        healthSnapshot: true,
        externalStateHygiene: true,
        snapshotHealth: true,
        specRequirementCount: true,
        peerSessions: false,
        pluginRuntime: false,
        projectMetadata: true,
        archivedBranchHygiene: true,
        resumeProjection: true,
        futureWork: true,
      };
  }
}
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
 *                         only) + storage_health.ok
 *                         (boolean) + worktree count + formatted.
 *   - health             : search_attributes + opencode_session_debt +
 *                         diagnostics + metrics
 *                         counters (placeholder until AC6 lands).
 *   - changes            : full status.changes detail (recent + byStatus).
 *   - hygiene            : recommendations full + opencode_session_debt
 *                         detail + project_metadata + _healthSnapshot
 *                         (closed-vs-active leak signals).
 */
import { type StatusSummaryOmissions } from "./status-enrich";

export function applyStatusView(
  full: Record<string, unknown>,
  view: AdvStatusView,
): Record<string, unknown> {
  const projection: Record<string, unknown> = {
    formatted: full.formatted,
    ...(full._projectContext ? { _projectContext: full._projectContext } : {}),
    ...(full.product_context ? { product_context: full.product_context } : {}),
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
  const statusSummaryOmissions = full.status_summary_omissions as
    | StatusSummaryOmissions
    | undefined;
  const worktreeCensus = full.worktree_census as { total?: number } | undefined;
  const specs = full.specs as { count?: number } | undefined;
  const recommendationSummary = full.recommendation_summary as
    | StatusRecommendationSummary
    | undefined;
  const recommendationGroups = full.recommendation_groups;

  // Degradation metadata is view-independent. Keep it at the projection root
  // so summary/changes/hygiene callers receive the same typed completeness
  // signal that health callers already see alongside `changes`.
  if (full.warnings) projection.warnings = full.warnings;
  if (full.hydrationStats) projection.hydrationStats = full.hydrationStats;

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
        ...(statusSummaryOmissions?.recentChanges
          ? { omitted: statusSummaryOmissions.recentChanges }
          : {}),
      };
      projection.recommendations = full.recommendations ?? [];
      if (recommendationSummary) {
        projection.recommendation_summary = recommendationSummary;
        projection.recommendation_groups = recommendationGroups;
      }
      if (statusSummaryOmissions?.recommendations) {
        projection.recommendations_omitted =
          statusSummaryOmissions.recommendations;
      }
      projection.storage_health_ok = true;
      projection.worktree_count = worktreeCensus?.total ?? 0;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      projection.future_work = full.future_work;
      if (full.bootstrap_retry) {
        projection.diagnostics = full.diagnostics;
        projection.bootstrap_retry = full.bootstrap_retry;
      }
      break;
    }
    case "health": {
      projection.changes = full.changes;
      projection._freshness = full._freshness;
      projection._health_execution = full._health_execution;
      projection.expected_queue = full.expected_queue;
      projection.worker_diagnostics = full.worker_diagnostics;
      projection.worker_role = full.worker_role;
      projection.feature_flags = full.feature_flags;
      // rq-autoManageAdvWorktrees AC2 — surface resolved-flag source +
      // auto-managed change census in health view so operators can audit
      // the worktree_guard_enforce posture and migration progress.
      projection.feature_flag_sources = full.feature_flag_sources;
      projection.auto_managed_changes = full.auto_managed_changes;
      projection.search_attributes = full.search_attributes;
      // AC5: advisory OS-level worker census —
      // workerCount + orphanCount + per-process pid/ppid/orphan — so
      // multi-session worker contention is visible before a wedge.
      projection.worker_processes = full.worker_processes;
      projection.diagnostics = full.diagnostics;
      // migration_status is a diagnostic field — surface here in addition
      // to hygiene view so operators see migration health alongside other
      // diagnostics.
      projection.migration_status = full.migration_status;
      // Recommendations array is small and useful for next-step routing
      // even when callers ask for the diagnostic view.
      projection.recommendations = full.recommendations ?? [];
      if (recommendationSummary) {
        projection.recommendation_summary = recommendationSummary;
        projection.recommendation_groups = recommendationGroups;
      }
      // Metrics counters (AC6).
      if (full.metrics) projection.metrics = full.metrics;
      // T4: tool-context telemetry (schema manifest + cache-token samples).
      projection.tool_context_telemetry = full.tool_context_telemetry;
      projection.plugin_runtime = full.plugin_runtime;
      projection.snapshot_health = full.snapshot_health;
      projection.worktree_census = full.worktree_census;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      projection.future_work = full.future_work;
      break;
    }
    case "changes": {
      projection.changes = full.changes;
      projection.recommendations = full.recommendations ?? [];
      if (recommendationSummary) {
        projection.recommendation_summary = recommendationSummary;
        projection.recommendation_groups = recommendationGroups;
      }
      break;
    }
    case "hygiene": {
      projection.recommendations = full.recommendations ?? [];
      if (recommendationSummary) {
        projection.recommendation_summary = recommendationSummary;
        projection.recommendation_groups = recommendationGroups;
      }
      projection.opencode_session_debt = full.opencode_session_debt;
      projection.project_metadata = full.project_metadata;
      projection._healthSnapshot = full._healthSnapshot;
      projection.external_state_hygiene = full.external_state_hygiene;
      projection.archived_branch_hygiene = full.archived_branch_hygiene;
      projection.migration_status = full.migration_status;
      projection.snapshot_health = full.snapshot_health;
      projection.terminal_cleanup_retained = full.terminal_cleanup_retained;
      projection.future_work = full.future_work;
      break;
    }
  }

  return projection;
}
