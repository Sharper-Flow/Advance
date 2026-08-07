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
import {
  createHealthProbeCache,
  type HealthProbeCache,
} from "./health-probe-cache";
import { getWorktreeCensus } from "../utils/worktree-census";
import { scanSnapshotHealth } from "./snapshot-scan";
import {
  executeHealthPlan,
  type HealthProviderDescriptor,
  type HealthProviderOutcome,
  type HealthExecutionResult,
  type Clock,
  type TimerService,
} from "./status-execution";
import {
  MISSING_PROJECT_ID_CACHE_KEY,
  type WorktreeCensusSnapshot,
  type SnapshotHealthSnapshot,
} from "./status-health";
import { loadProjectConfigWithDiagnostics } from "../storage/json";
import {
  resolveProjectFeaturePolicy,
  type FeaturePolicySource,
} from "../types";
import { listPeerSessions } from "./session/index";
import { getPluginRuntimeInfo } from "../utils/plugin-runtime-info";
import { getToolSchemaManifest } from "../utils/tool-schema-telemetry";
import { getLaneProjections } from "../utils/tool-lane-projection";
import type { ToolSchemaProjection } from "../utils/tool-schema-projection";
import {
  getPendingDeletes,
  initStateDb as initWorktreeStateDb,
  summarizePendingDeletes,
  type PendingDeleteSummary,
} from "./worktree/state";

// One request-scoped absolute budget for `adv_status view:health`. The cutoff
// closes provider admission early enough to reserve bounded composition time
// (cutoff + reserve = deadline), and concurrency/candidate limits are fixed and
// explicit rather than derived. Deadline expiry yields typed partial output;
// late provider completion must not mutate the returned result.
// rq-statusHealthAggregateBudget01
export const HEALTH_RESPONSE_DEADLINE_MS = 8_000;
export const HEALTH_EXECUTION_CUTOFF_MS = 7_500;
export const HEALTH_COMPOSITION_RESERVE_MS = 500;
export const HEALTH_MAX_CONCURRENCY = 4;
export const HEALTH_CANDIDATE_LIMIT = 10;
const DEFAULT_PROVIDER_CAP_MS = 1_500;
// `opencode debug agent` is an advisory subprocess probe. Keep it from
// consuming the entire health cutoff when the host CLI is unavailable or
// waiting on another process. The executor still reports `timeout` honestly.
const TOOL_LANE_PROJECTION_CAP_MS = 1_500;

export interface HealthRequestContext {
  startTime: number;
  cutoffTime: number;
  deadlineTime: number;
  signal?: AbortSignal;
}

export interface HealthStatusInput {
  store: Store;
  projectId: string | undefined;
  forceRefresh: boolean;
  autoManagedCensus: Record<string, number>;
  request: HealthRequestContext;
  loadMigrationStatus: () => Promise<unknown>;
}

export interface HealthStatusOutput {
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
  feature_flag_sources: Record<string, FeaturePolicySource>;
  auto_managed_changes: Record<string, number>;
  terminal_cleanup_retained: PendingDeleteSummary;
  migration_status: unknown;
  requirement_count: number;
  /** Bounded, best-effort shell probe captured inside the health execution plan. */
  tool_lane_projections: Record<string, ToolSchemaProjection> | undefined;
  configResult: Awaited<ReturnType<typeof loadProjectConfigWithDiagnostics>>;
  _health_execution: Record<string, unknown>;
  _freshness: Record<string, ProbeCacheFreshness>;
}

interface ProviderValue<T> {
  value: T;
  freshness?: ProbeCacheFreshness;
}

const requestWorktreeCensusCache = createHealthProbeCache<
  WorktreeCensusSnapshot,
  string
>({
  name: "health.worktree_census",
  ttlMs: 2_000,
  fetch: (root, { signal }) => getWorktreeCensus(root, { signal }),
});
const requestSnapshotHealthCache = createHealthProbeCache<
  SnapshotHealthSnapshot,
  string
>({
  name: "health.snapshot_health",
  ttlMs: 60_000,
  fetch: (key) =>
    scanSnapshotHealth({
      scope: "project",
      projectId: key === MISSING_PROJECT_ID_CACHE_KEY ? "unknown" : key,
    }),
});

/** Test/runtime reset hook for request-owned advisory probe caches. */
export const _healthRequestProbeCaches = {
  clear(): void {
    requestWorktreeCensusCache.clear();
    requestSnapshotHealthCache.clear();
  },
};

function directFreshness(
  ttlMs: number,
  publishedAt: number,
): ProbeCacheFreshness {
  return {
    cached_at: new Date(publishedAt).toISOString(),
    stale: false,
    age_ms: 0,
    ttl_ms: ttlMs,
  };
}

async function fetchForHealth<T>(input: {
  forceRefresh: boolean;
  key: string;
  cache: HealthProbeCache<T, string>;
  signal: AbortSignal;
  cutoffTime: number;
  ttlMs: number;
}): Promise<{ value: T; freshness: ProbeCacheFreshness }> {
  if (!input.forceRefresh) {
    const cached = input.cache.read(input.key);
    if (cached) {
      return {
        value: cached.value,
        freshness: directFreshness(input.ttlMs, cached.publishedAt),
      };
    }
  }
  const refreshed = await input.cache.refresh(input.key, {
    signal: input.signal,
    cutoffTime: input.cutoffTime,
  });
  return {
    value: refreshed.value,
    freshness: directFreshness(input.ttlMs, refreshed.publishedAt),
  };
}

export function createHealthRequestContext(
  now: number = Date.now(),
): HealthRequestContext {
  return {
    startTime: now,
    cutoffTime: now + HEALTH_EXECUTION_CUTOFF_MS,
    deadlineTime: now + HEALTH_RESPONSE_DEADLINE_MS,
  };
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
          const policy = resolveProjectFeaturePolicy(rawFeatures);
          const featureFlags = {
            ...(rawFeatures ?? {}),
            worker_singleton_enforce: policy.worker_singleton_enforce.value,
            worktree_guard_enforce: policy.worktree_guard_enforce.value,
          };
          const featureFlagSources: Record<string, FeaturePolicySource> = {
            worker_singleton_enforce: policy.worker_singleton_enforce.source,
            worktree_guard_enforce: policy.worktree_guard_enforce.source,
          };
          for (const key of Object.keys(featureFlags)) {
            if (!(key in featureFlagSources)) {
              featureFlagSources[key] = "explicit";
            }
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
      source: "worktree_census",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } = await fetchForHealth({
            forceRefresh,
            key: store.paths.root,
            cache: requestWorktreeCensusCache,
            signal: ctx.signal,
            cutoffTime: ctx.cutoffTime,
            ttlMs: 2_000,
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
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "abortable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const { value, freshness } = await fetchForHealth({
            forceRefresh,
            key: projectId ?? MISSING_PROJECT_ID_CACHE_KEY,
            cache: requestSnapshotHealthCache,
            signal: ctx.signal,
            cutoffTime: ctx.cutoffTime,
            ttlMs: 60_000,
          });
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
      source: "terminal_cleanup_retained",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "bounded_non_cancellable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const value = await readOnlyTerminalCleanup();
          captureValue("terminal_cleanup_retained", { value });
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
      source: "migration_status",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "bounded_non_cancellable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const value = await input.loadMigrationStatus();
          captureValue("migration_status", { value });
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
      source: "spec_requirement_count",
      dependencies: [],
      cap: DEFAULT_PROVIDER_CAP_MS,
      cancellability: "bounded_non_cancellable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        try {
          const specsList = await store.specs.list();
          const value = specsList.specs.reduce(
            (sum, spec) => sum + (spec.requirementCount ?? 0),
            0,
          );
          captureValue("spec_requirement_count", { value });
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
    // Advisory and potentially process-bound: schedule after the established
    // health diagnostics so it cannot displace their static priority order.
    {
      source: "tool_lane_projections",
      dependencies: [],
      cap: TOOL_LANE_PROJECTION_CAP_MS,
      cancellability: "bounded_non_cancellable",
      async run(ctx): Promise<HealthProviderOutcome> {
        const providerStart = ctx.clock.now();
        const projections = await getLaneProjections(getToolSchemaManifest());
        captureValue("tool_lane_projections", { value: projections });
        return {
          kind: "ok",
          value: projections,
          elapsedMs: Math.max(0, ctx.clock.now() - providerStart),
        };
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
    requestSignal: input.request.signal,
    requestStartTime: input.request.startTime,
    cutoffTime: input.request.cutoffTime,
    deadlineTime: input.request.deadlineTime,
  });

  const projectConfig = getCaptured<{
    configResult: Awaited<ReturnType<typeof loadProjectConfigWithDiagnostics>>;
    featureFlags: Record<string, unknown>;
    featureFlagSources: Record<string, FeaturePolicySource>;
  }>("project_config");

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
    worktree_census: getCaptured<WorktreeCensusSnapshot>("worktree_census"),
    snapshot_health: getCaptured<SnapshotHealthSnapshot>("snapshot_health"),
    peer_sessions: peerSessions,
    plugin_runtime: pluginRuntime,
    feature_flags:
      projectConfig?.featureFlags ??
      (() => {
        const policy = resolveProjectFeaturePolicy(undefined);
        return {
          worker_singleton_enforce: policy.worker_singleton_enforce.value,
          worktree_guard_enforce: policy.worktree_guard_enforce.value,
        };
      })(),
    feature_flag_sources: projectConfig?.featureFlagSources ?? {},
    auto_managed_changes: input.autoManagedCensus,
    terminal_cleanup_retained: getCaptured<PendingDeleteSummary>(
      "terminal_cleanup_retained",
    ) ?? {
      total: 0,
      classes: {},
    },
    migration_status: getCaptured<unknown>("migration_status") ?? null,
    requirement_count: getCaptured<number>("spec_requirement_count") ?? 0,
    tool_lane_projections: getCaptured<Record<string, ToolSchemaProjection>>(
      "tool_lane_projections",
    ),
    configResult: projectConfig?.configResult ?? {
      success: false,
      type: "not_found",
      error: "project config not loaded",
    },
    _health_execution,
    _freshness: freshness,
  };
}

export function buildHealthStatusReadOptions(): {
  recentLimit: number;
  sourceRanked: true;
} {
  return {
    recentLimit: HEALTH_CANDIDATE_LIMIT,
    sourceRanked: true,
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
  const rankingWarning = statusResult.warnings?.find(
    (warning) => warning.code === "SOURCE_RANKING_DEGRADED",
  );
  const admitted = HEALTH_CANDIDATE_LIMIT;
  return {
    ...baseMeta,
    admitted_count: admitted,
    omitted_count: boundedOmitted,
    omitted_sample: omittedIds.slice(0, 20),
    ...(rankingWarning
      ? {
          source_ranking: {
            kind: "degraded",
            missing_timestamp_ids: (rankingWarning.omittedIds ?? []).slice(
              0,
              20,
            ),
          },
        }
      : {}),
  };
}
