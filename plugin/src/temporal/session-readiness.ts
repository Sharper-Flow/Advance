import {
  evaluateQueueReadiness,
  type LocalOwnership,
  type QueueServiceabilityConfidence,
  type ServerPollerProbe,
  type ServerPollerProbeStatus,
} from "./queue-serviceability";

export interface QueryProbeResult {
  ok: boolean;
  error?: string;
}

export type QueryProbe = (targetQueue: string) => Promise<QueryProbeResult>;

export type DescribeTaskQueueProbe = (
  targetQueue: string,
) => Promise<ServerPollerProbe>;

export type ReadinessProbeKind =
  | QueueServiceabilityConfidence
  | "query"
  | "none";

export interface EvaluateTargetReadinessInput {
  targetQueue: string;
  hasWorkflow: boolean;
  localSignal?: {
    localRegistered: boolean;
    localWorkerAlive: boolean;
    localOwnership: LocalOwnership;
  };
  serverPollerStatus?: ServerPollerProbeStatus;
  staleRunningWorkflowCount?: number;
  queryProbe?: QueryProbe;
  describeTaskQueueProbe?: DescribeTaskQueueProbe;
  probeBudgetMs?: number;
  cacheTtlMs?: number;
  nowMs?: () => number;
}

export interface TargetReadinessResult {
  ready: boolean;
  blockers: string[];
  probeKind: ReadinessProbeKind;
}

type CacheState = "UNPROVEN" | "READY" | "STALE";

interface ReadinessCacheEntry {
  state: CacheState;
  provenAt: number | null;
  staleAt: number | null;
  probeKind: ReadinessProbeKind;
}

const DEFAULT_PROBE_BUDGET_MS = 2_000;
const DEFAULT_CACHE_TTL_MS = 10_000;

const readinessCache = new Map<string, ReadinessCacheEntry>();
let registeredQueryProbe: QueryProbe | null = null;
let registeredDescribeTaskQueueProbe: DescribeTaskQueueProbe | null = null;

export function registerReadinessProbes(probes: {
  query?: QueryProbe;
  describeTaskQueue?: DescribeTaskQueueProbe;
}): void {
  if (probes.query) {
    registeredQueryProbe = probes.query;
  }
  if (probes.describeTaskQueue) {
    registeredDescribeTaskQueueProbe = probes.describeTaskQueue;
  }
}

export function resetReadinessState(): void {
  readinessCache.clear();
  registeredQueryProbe = null;
  registeredDescribeTaskQueueProbe = null;
}

export function markStale(targetQueue: string): void {
  const existing = readinessCache.get(targetQueue);
  if (existing?.state === "READY") {
    readinessCache.set(targetQueue, {
      ...existing,
      state: "STALE",
      staleAt: Date.now(),
    });
  } else if (!existing) {
    readinessCache.set(targetQueue, {
      state: "STALE",
      provenAt: null,
      staleAt: Date.now(),
      probeKind: "none",
    });
  }
}

export async function evaluateTargetReadiness(
  input: EvaluateTargetReadinessInput,
): Promise<TargetReadinessResult> {
  const now = input.nowMs?.() ?? Date.now();
  const cacheTtlMs = Math.min(
    input.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS,
    DEFAULT_CACHE_TTL_MS,
  );
  const cached = readinessCache.get(input.targetQueue);

  if (
    cached?.state === "READY" &&
    cached.provenAt !== null &&
    now - cached.provenAt < cacheTtlMs
  ) {
    return { ready: true, blockers: [], probeKind: cached.probeKind };
  }

  const result = await runProbe(input);

  if (result.ready) {
    readinessCache.set(input.targetQueue, {
      state: "READY",
      provenAt: now,
      staleAt: null,
      probeKind: result.probeKind,
    });
  } else {
    readinessCache.set(input.targetQueue, {
      state: "UNPROVEN",
      provenAt: null,
      staleAt: null,
      probeKind: "none",
    });
  }

  return result;
}

async function runProbe(
  input: EvaluateTargetReadinessInput,
): Promise<TargetReadinessResult> {
  const queryProbe = input.queryProbe ?? registeredQueryProbe;
  const describeTaskQueueProbe =
    input.describeTaskQueueProbe ?? registeredDescribeTaskQueueProbe;
  const budgetMs = Math.min(
    input.probeBudgetMs ?? DEFAULT_PROBE_BUDGET_MS,
    DEFAULT_PROBE_BUDGET_MS,
  );

  if (input.hasWorkflow) {
    if (!queryProbe) {
      return notReady(["ADV_SESSION_NOT_READY"]);
    }

    let queryResult: QueryProbeResult | "timeout";
    try {
      queryResult = await runWithBudget(
        queryProbe(input.targetQueue),
        budgetMs,
      );
    } catch {
      return notReady(["ADV_SESSION_NOT_READY"]);
    }

    if (queryResult === "timeout") {
      return notReady(["ADV_SESSION_NOT_READY"]);
    }

    if (queryResult.ok) {
      return { ready: true, blockers: [], probeKind: "query" };
    }

    // Failed Query overrides any fresh DescribeTaskQueue evidence.
    const blockers = ["ADV_SESSION_NOT_READY"];
    if (queryResult.error) {
      blockers.push(queryResult.error);
    }
    return notReady(blockers);
  }

  // No workflow yet: required proof is observed local-worker readiness.
  if (!input.localSignal) {
    return notReady(["ADV_SESSION_NOT_READY", "local_signal_unavailable"]);
  }
  const localReadiness = evaluateQueueReadiness({
    localRegistered: input.localSignal.localRegistered,
    localWorkerAlive: input.localSignal.localWorkerAlive,
    localOwnership: input.localSignal.localOwnership,
    serverPollerStatus: "unavailable",
    staleRunningWorkflowCount: input.staleRunningWorkflowCount ?? 0,
  });

  if (localReadiness.ready) {
    return {
      ready: true,
      blockers: [],
      probeKind: localReadiness.probeKind,
    };
  }

  const blockers = ["ADV_SESSION_NOT_READY", ...localReadiness.blockers];

  // DescribeTaskQueue poller freshness is advisory only.
  if (describeTaskQueueProbe) {
    try {
      const dtqResult = await runWithBudget(
        describeTaskQueueProbe(input.targetQueue),
        budgetMs,
      );
      if (dtqResult === "timeout") {
        blockers.push("describe_task_queue_timeout");
      } else if (dtqResult.status === "stale") {
        blockers.push("describe_task_queue_stale");
      } else if (dtqResult.status === "none") {
        blockers.push("describe_task_queue_no_pollers");
      } else if (dtqResult.status === "unavailable") {
        blockers.push("describe_task_queue_unavailable");
      }
    } catch {
      blockers.push("describe_task_queue_unavailable");
    }
  }

  return notReady(blockers);
}

function notReady(blockers: string[]): TargetReadinessResult {
  return {
    ready: false,
    blockers: [...new Set(blockers)],
    probeKind: "none",
  };
}

async function runWithBudget<T>(
  promise: Promise<T>,
  budgetMs: number,
): Promise<T | "timeout"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), budgetMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
