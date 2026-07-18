/**
 * status-health-plan.ts
 *
 * Request-local bounded execution plan for `adv_status view:"health"`.
 *
 * Wires the existing HealthExecutionPlan executor around the existing probe
 * and diagnostic helpers. Every provider is typed and degrades safely; the
 * result carries the additive `_health_execution` metadata required by the
 * bounded health contract.
 */

import type { Store } from "../storage/store";
import type { ProbeCacheFreshness } from "./probe-cache";
import { createTemporalReadDeadline } from "../temporal/retry-wrapper";
import {
  executeHealthPlan,
  type HealthProviderDescriptor,
  type HealthProviderOutcome,
  type HealthExecutionResult,
  type Clock,
  type TimerService,
} from "./status-execution";
import { getQueueServiceability } from "./health-probe-cache";
import {
  fetchStatusTemporalHealth,
  statusWorktreeCensusProbeCache,
  fetchStatusWorkerProcesses,
  fetchStatusSnapshotHealth,
  statusSearchAttributesProbeCache,
  buildTemporalHealthFallback,
  MISSING_PROJECT_ID_CACHE_KEY,
  type TemporalHealthSnapshot,
  type WorktreeCensusSnapshot,
  type SearchAttributesSnapshot,
  type SnapshotHealthSnapshot,
  type WorkerProcessesSnapshot,
  type StatusQueueServiceabilitySnapshot,
} from "./status-health";
import { loadProjectConfigWithDiagnostics } from "../storage/json";
import { withStabilityFeatureDefaults } from "../types";
import { listPeerSessions } from "./session/index";
import { getPluginRuntimeInfo } from "../utils/plugin-runtime-info";
import {
  getPendingDeletes,
  initStateDb as initWorktreeStateDb,
  summarizePendingDeletes,
  type PendingDeleteSummary,
} from "./worktree/state";

export const HEALTH_RESPONSE_DEADLINE_MS = 8_000;
export const HEALTH_EXECUTION_CUTOFF_MS = 7_500;
export const HEALTH_COMPOSITION_RESERVE_MS = 500;
export const HEALTH_MAX_CONCURRENCY = 4;
export const HEALTH_CANDIDATE_LIMIT = 10;
const DEFAULT_PROVIDER_CAP_MS = 1_500;

export interface HealthStatusInput {
  store: Store;
  projectId: string | undefined;
  forceRefresh: boolean;
  autoManagedCensus: Record<string, number>;
}

export interface HealthStatusOutput {
  temporal_health: TemporalHealthSnapshot | undefined;
  expected_queue?: string;
  temporal_queue_serviceability:
    | StatusQueueServiceabilitySnapshot["serviceability"]
    | undefined;
  worker_diagnostics:
    | StatusQueueServiceabilitySnapshot["workerDiagnostics"]
    | undefined;
  search_attributes: SearchAttributesSnapshot | undefined;
  worker_processes: WorkerProcessesSnapshot | undefined;
  worktree_census: WorktreeCensusSnapshot | undefined;
  snapshot_health: SnapshotHealthSnapshot | undefined;
  peer_sessions:
    | Array<{
        sessionId: string;
        startedAt: string;
        worktree: string;
        isSelf: boolean;
      }>
    | { unavailable: true }
    | undefined;
  plugin_runtime: unknown;
  feature_flags: Record<string, unknown>;
  feature_flag_sources: Record<string, "default" | "explicit">;
  auto_managed_changes: Record<string, number>;
  terminal_cleanup_retained: PendingDeleteSummary;
  configResult: Awaited<ReturnType<typeof loadProjectConfigWithDiagnostics>>;
  _health_execution: Record<string, unknown>;
  _freshness: Record<string, ProbeCacheFreshness>;
}

interface ProviderValue<T> {
  value: T;
  freshness?: ProbeCacheFreshness;
}

export async function runHealthStatus(
  input: HealthStatusInput,
): Promise<HealthStatusOutput> {
  const clock: Clock = { now: () => Date.now() };
  const timer: TimerService = {
    setTimeout: (cb, ms) => globalThis.setTimeout(cb, ms) as unknown as number,
    clearTimeout: (id) => globalThis.clearTimeout(id),
  };

  const { store, projectId, forceRefresh } = input;
  const capturedValues = new Map<string, unknown>();
  const capturedFreshness = new Map<string, ProbeCacheFreshness>();

  function captureValue<T>(source: string, v: ProviderValue<T>): void {
    capturedValues.set(source, v.value);
    if (v.freshness) {
      capturedFreshness.set(source, v.freshness);
    }
  }

  function getCaptured<T>(source: string): T | undefined {
    return capturedValues.get(source) as T | undefined;
  }

  async function readOnlyTerminalCleanup(): Promise<PendingDeleteSummary> {
    try {
      const access = await initWorktreeStateDb(store.paths.root);
      return summarizePendingDeletes(await getPendingDeletes(access));
    } catch {
      return { total: 0, classes: {} };
    }
  }

  const providers: HealthProviderDescriptor[] = [
    {
      source: "temporal_health",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } = await fetchStatusTemporalHealth(
            projectId,
            { forceRefresh },
          );
          captureValue("temporal_health", { value, freshness });
          return {
            kind: freshness.stale ? "stale" : "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: freshness.error,
          };
        } catch (err) {
          const fallback = buildTemporalHealthFallback(err);
          captureValue("temporal_health", { value: fallback });
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "search_attributes",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } =
            await statusSearchAttributesProbeCache.fetch(
              projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
              { forceRefresh },
            );
          captureValue("search_attributes", { value, freshness });
          return {
            kind: freshness.stale ? "stale" : "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: freshness.error,
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "project_config",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const configResult = await loadProjectConfigWithDiagnostics(
            store.paths.root,
          );
          const rawFeatures = configResult.success
            ? (configResult.data.features as Record<string, unknown>)
            : undefined;
          const featureFlags = withStabilityFeatureDefaults(rawFeatures);
          const featureFlagSources: Record<string, "default" | "explicit"> = {};
          for (const key of Object.keys(featureFlags)) {
            featureFlagSources[key] =
              rawFeatures && typeof rawFeatures[key] !== "undefined"
                ? "explicit"
                : "default";
          }
          captureValue("project_config", {
            value: {
              configResult,
              featureFlags,
              featureFlagSources,
            },
          });
          return {
            kind: "ok",
            value: {
              configResult,
              featureFlags,
              featureFlagSources,
            },
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "worker_processes",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } = await fetchStatusWorkerProcesses({
            forceRefresh,
          });
          captureValue("worker_processes", { value, freshness });
          return {
            kind: freshness.stale ? "stale" : "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: freshness.error,
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "worktree_census",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } =
            await statusWorktreeCensusProbeCache.fetch(store.paths.root, {
              forceRefresh,
            });
          captureValue("worktree_census", { value, freshness });
          return {
            kind: freshness.stale ? "stale" : "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: freshness.error,
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "snapshot_health",
      dependencies: [],
      cap: 4_000,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } = await fetchStatusSnapshotHealth(
            projectId,
            { forceRefresh },
          );
          captureValue("snapshot_health", { value, freshness });
          return {
            kind: freshness.stale ? "stale" : "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: freshness.error,
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "peer_sessions",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const result = await listPeerSessions({
            projectRoot: store.paths.root,
          });
          captureValue("peer_sessions", { value: result });
          return {
            kind: "ok",
            value: result,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
          };
        } catch (err) {
          captureValue("peer_sessions", { value: { unavailable: true } });
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "plugin_runtime",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const value = await getPluginRuntimeInfo();
          captureValue("plugin_runtime", { value });
          return {
            kind: "ok",
            value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
    {
      source: "temporal_queue_serviceability",
      dependencies: ["temporal_health"],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        const health = getCaptured<TemporalHealthSnapshot>("temporal_health");
        if (!health?.server_alive) {
          return {
            kind: "not_admitted",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: health
              ? "temporal health reports server unavailable"
              : "temporal_health not available",
          };
        }
        try {
          const result = await getQueueServiceability(
            { projectId, health },
            { signal: ctx.signal },
          );
          captureValue("temporal_queue_serviceability", {
            value: result.value,
          });
          if (result.outcome === "not_admitted") {
            return {
              kind: "not_admitted",
              elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
              evidence: result.evidence,
            };
          }
          return {
            kind: "ok",
            value: result.value,
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
          };
        } catch (err) {
          return {
            kind: "error",
            elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
            evidence: err instanceof Error ? err.message : String(err),
          };
        }
      },
    },
  ];

  const result: HealthExecutionResult = await executeHealthPlan({
    responseDeadlineMs: HEALTH_RESPONSE_DEADLINE_MS,
    executionCutoffMs: HEALTH_EXECUTION_CUTOFF_MS,
    compositionReserveMs: HEALTH_COMPOSITION_RESERVE_MS,
    maxConcurrency: HEALTH_MAX_CONCURRENCY,
    providers,
    clock,
    timer,
  });

  const projectConfig = getCaptured<{
    configResult: Awaited<ReturnType<typeof loadProjectConfigWithDiagnostics>>;
    featureFlags: Record<string, unknown>;
    featureFlagSources: Record<string, "default" | "explicit">;
  }>("project_config");

  const queueServiceability = getCaptured<StatusQueueServiceabilitySnapshot>(
    "temporal_queue_serviceability",
  );
  const peerSessions = getCaptured<
    | Array<{
        sessionId: string;
        startedAt: string;
        worktree: string;
        isSelf: boolean;
      }>
    | { unavailable: true }
  >("peer_sessions");
  const pluginRuntime = getCaptured<unknown>("plugin_runtime");

  const freshness: Record<string, ProbeCacheFreshness> = {};
  for (const [source, f] of capturedFreshness.entries()) {
    freshness[source] = f;
  }

  const _health_execution: Record<string, unknown> = {
    schema_version: "1.0",
    response_deadline_ms: HEALTH_RESPONSE_DEADLINE_MS,
    execution_cutoff_ms: HEALTH_EXECUTION_CUTOFF_MS,
    composition_reserve_ms: HEALTH_COMPOSITION_RESERVE_MS,
    max_concurrency: HEALTH_MAX_CONCURRENCY,
    candidate_limit: HEALTH_CANDIDATE_LIMIT,
    complete: result.meta.complete,
    degraded: result.meta.degraded,
    elapsed_ms: result.meta.elapsedMs,
    meta: {
      elapsed_ms: result.meta.elapsedMs,
    },
    outcomes: Object.fromEntries(
      Object.entries(result.outcomes).map(([source, outcome]) => [
        source,
        {
          kind: outcome.kind,
          elapsed_ms: outcome.elapsedMs,
          evidence: outcome.evidence,
        },
      ]),
    ),
  };

  return {
    temporal_health: getCaptured<TemporalHealthSnapshot>("temporal_health"),
    expected_queue: queueServiceability?.expectedQueue,
    temporal_queue_serviceability: queueServiceability?.serviceability,
    worker_diagnostics: queueServiceability?.workerDiagnostics,
    search_attributes:
      getCaptured<SearchAttributesSnapshot>("search_attributes"),
    worker_processes: getCaptured<WorkerProcessesSnapshot>("worker_processes"),
    worktree_census: getCaptured<WorktreeCensusSnapshot>("worktree_census"),
    snapshot_health: getCaptured<SnapshotHealthSnapshot>("snapshot_health"),
    peer_sessions: peerSessions,
    plugin_runtime: pluginRuntime,
    feature_flags:
      projectConfig?.featureFlags ?? withStabilityFeatureDefaults(undefined),
    feature_flag_sources: projectConfig?.featureFlagSources ?? {},
    auto_managed_changes: input.autoManagedCensus,
    terminal_cleanup_retained: await readOnlyTerminalCleanup(),
    configResult: projectConfig?.configResult ?? {
      success: false,
      type: "not_found",
      error: "project config not loaded",
    },
    _health_execution,
    _freshness: freshness,
  };
}

export function buildHealthStatusDeadline(): {
  budgetMs: number;
  deadlineAt: number;
} {
  return createTemporalReadDeadline(HEALTH_EXECUTION_CUTOFF_MS);
}

export function buildHealthStatusReadOptions():
  | { recentLimit: number; deadline: { budgetMs: number; deadlineAt: number } }
  | undefined {
  return {
    recentLimit: HEALTH_CANDIDATE_LIMIT,
    deadline: buildHealthStatusDeadline(),
  };
}

export function buildHealthExecutionMeta(
  statusResult: {
    hydrationStats?: {
      boundedOmitted?: number;
      omitted?: number;
      deadlineExceeded?: boolean;
    };
    warnings?: Array<{
      code?: string;
      omittedCount?: number;
      omittedIds?: string[];
    }>;
  },
  baseMeta: Record<string, unknown>,
): Record<string, unknown> {
  const boundedOmitted = statusResult.hydrationStats?.boundedOmitted ?? 0;
  const omittedIds =
    statusResult.warnings?.find((w) => w.code === "SOURCE_BOUND_EXCEEDED")
      ?.omittedIds ?? [];
  const admitted = HEALTH_CANDIDATE_LIMIT;
  return {
    ...baseMeta,
    admitted_count: admitted,
    omitted_count: boundedOmitted,
    omitted_sample: omittedIds.slice(0, 20),
  };
}
