export type QueueServiceabilityStatus =
  | "serviceable"
  | "not_serviceable"
  | "unknown";

export type QueueServiceabilityConfidence =
  | "local"
  | "server"
  | "combined"
  | "none";

export type LocalOwnership = "owned" | "peer" | "unknown";

export type ServerPollerProbeStatus =
  | "fresh"
  | "stale"
  | "none"
  | "unavailable";

export interface ServerPollerProbe {
  status: ServerPollerProbeStatus;
  lastAccessMs: number | null;
  pollerCount?: number;
  lastPollerAt?: string | null;
  error?: string;
}

export interface QueueServiceabilityInput {
  projectId: string;
  expectedQueue: string;
  localRegistered: boolean;
  localWorkerAlive: boolean;
  localOwnership: LocalOwnership;
  workerDiagnostics?: unknown;
  serverPollerProbe?: ServerPollerProbe;
  staleRunningWorkflowCount?: number;
  staleQueueProbe: "ok" | "degraded" | "unavailable";
}

export interface QueueServiceability {
  projectId: string;
  expectedQueue: string;
  status: QueueServiceabilityStatus;
  confidence: QueueServiceabilityConfidence;
  evidence: {
    localRegistered: boolean;
    localWorkerAlive: boolean;
    localOwnership: LocalOwnership;
    workerDiagnostics?: unknown;
    serverPollerProbe: ServerPollerProbeStatus;
    pollerLastAccessMs: number | null;
    staleRunningWorkflowCount: number;
    staleQueueProbe: "ok" | "degraded" | "unavailable";
  };
  blockers: string[];
}

export interface QueueReadinessInput {
  localRegistered: boolean;
  localWorkerAlive: boolean;
  localOwnership: LocalOwnership;
  serverPollerStatus: ServerPollerProbeStatus;
  staleRunningWorkflowCount: number;
}

export interface QueueReadiness {
  ready: boolean;
  blockers: string[];
  probeKind: QueueServiceabilityConfidence;
}

export function evaluateQueueReadiness(
  input: QueueReadinessInput,
): QueueReadiness {
  const localServiceable =
    input.localRegistered &&
    input.localWorkerAlive &&
    input.localOwnership !== "peer";
  const serverServiceable = input.serverPollerStatus === "fresh";

  const blockers: string[] = [];
  if (!input.localRegistered) blockers.push("local_queue_not_registered");
  if (!input.localWorkerAlive) blockers.push("local_worker_not_alive");
  if (input.localOwnership === "peer" && !serverServiceable) {
    blockers.push("peer_owned_without_serviceability_evidence");
  }
  if (input.serverPollerStatus === "unavailable") {
    blockers.push("server_poller_probe_unavailable");
  }
  if (input.serverPollerStatus === "stale")
    blockers.push("server_poller_stale");
  if (input.serverPollerStatus === "none")
    blockers.push("server_poller_absent");
  if (input.staleRunningWorkflowCount > 0) {
    blockers.push("stale_running_workflows_without_poller");
  }

  let ready: boolean;
  let probeKind: QueueServiceabilityConfidence;

  if (localServiceable && serverServiceable) {
    ready = true;
    probeKind = "combined";
  } else if (localServiceable) {
    ready = true;
    probeKind = "local";
  } else if (serverServiceable) {
    ready = true;
    probeKind = "server";
  } else if (
    input.staleRunningWorkflowCount > 0 ||
    input.serverPollerStatus === "stale" ||
    input.serverPollerStatus === "none"
  ) {
    ready = false;
    probeKind = "none";
  } else {
    ready = false;
    probeKind = "none";
  }

  return {
    ready,
    blockers: ready ? [] : [...new Set(blockers)],
    probeKind,
  };
}

export function classifyQueueServiceability(
  input: QueueServiceabilityInput,
): QueueServiceability {
  const serverProbe = input.serverPollerProbe ?? {
    status: "unavailable" as const,
    lastAccessMs: null,
  };
  const staleRunningWorkflowCount = input.staleRunningWorkflowCount ?? 0;

  const readiness = evaluateQueueReadiness({
    localRegistered: input.localRegistered,
    localWorkerAlive: input.localWorkerAlive,
    localOwnership: input.localOwnership,
    serverPollerStatus: serverProbe.status,
    staleRunningWorkflowCount,
  });

  let status: QueueServiceabilityStatus;
  if (readiness.ready) {
    status = "serviceable";
  } else if (
    staleRunningWorkflowCount > 0 ||
    serverProbe.status === "stale" ||
    serverProbe.status === "none"
  ) {
    status = "not_serviceable";
  } else {
    status = "unknown";
  }

  return {
    projectId: input.projectId,
    expectedQueue: input.expectedQueue,
    status,
    confidence: readiness.probeKind,
    evidence: {
      localRegistered: input.localRegistered,
      localWorkerAlive: input.localWorkerAlive,
      localOwnership: input.localOwnership,
      ...(input.workerDiagnostics !== undefined
        ? { workerDiagnostics: input.workerDiagnostics }
        : {}),
      serverPollerProbe: serverProbe.status,
      pollerLastAccessMs: serverProbe.lastAccessMs,
      staleRunningWorkflowCount,
      staleQueueProbe: input.staleQueueProbe,
    },
    blockers: readiness.blockers,
  };
}

export interface DescribeTaskQueueConnectionLike {
  workflowService?: {
    describeTaskQueue?: (req: {
      namespace: string;
      taskQueue: { name: string };
      taskQueueType: number;
    }) => Promise<unknown>;
  };
}

export interface ProbeTaskQueuePollersInput {
  connection: DescribeTaskQueueConnectionLike;
  namespace: string;
  taskQueue: string;
  nowMs?: () => number;
  freshPollerMs?: number;
}

const DEFAULT_FRESH_POLLER_MS = 60_000;
const TASK_QUEUE_TYPE_WORKFLOW = 1;

export async function probeTaskQueuePollers(
  input: ProbeTaskQueuePollersInput,
): Promise<ServerPollerProbe> {
  const describeTaskQueue = input.connection.workflowService?.describeTaskQueue;
  if (!describeTaskQueue) {
    return {
      status: "unavailable",
      lastAccessMs: null,
      pollerCount: 0,
      lastPollerAt: null,
      error: "WorkflowService.describeTaskQueue unavailable",
    };
  }

  try {
    const response = await describeTaskQueue({
      namespace: input.namespace,
      taskQueue: { name: input.taskQueue },
      taskQueueType: TASK_QUEUE_TYPE_WORKFLOW,
    });
    const pollers = extractPollers(response);
    if (pollers.length === 0)
      return {
        status: "none",
        lastAccessMs: null,
        pollerCount: 0,
        lastPollerAt: null,
      };

    const nowMs = input.nowMs?.() ?? Date.now();
    const ages = pollers
      .map((poller) => parseLastAccessMs(poller.lastAccessTime, nowMs))
      .filter((age): age is number => age !== null)
      .sort((a, b) => a - b);

    if (ages.length === 0) {
      return {
        status: "unavailable",
        lastAccessMs: null,
        pollerCount: 0,
        lastPollerAt: null,
        error: "Task queue pollers had no parseable lastAccessTime",
      };
    }

    const lastAccessMs = ages[0]!;
    const freshPollerMs = input.freshPollerMs ?? DEFAULT_FRESH_POLLER_MS;
    return {
      status: lastAccessMs <= freshPollerMs ? "fresh" : "stale",
      lastAccessMs,
      pollerCount: pollers.length,
      lastPollerAt: new Date(nowMs - lastAccessMs).toISOString(),
    };
  } catch (err) {
    return {
      status: "unavailable",
      lastAccessMs: null,
      pollerCount: 0,
      lastPollerAt: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractPollers(response: unknown): Array<Record<string, unknown>> {
  if (!response || typeof response !== "object") return [];
  const pollers = (response as { pollers?: unknown }).pollers;
  return Array.isArray(pollers)
    ? pollers.filter(
        (poller): poller is Record<string, unknown> =>
          Boolean(poller) && typeof poller === "object",
      )
    : [];
}

function parseLastAccessMs(value: unknown, nowMs: number): number | null {
  const timestampMs = parseTimestampMs(value);
  if (timestampMs === null) return null;
  return Math.max(0, nowMs - timestampMs);
}

function parseTimestampMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const seconds = toNumber(record.seconds);
  if (seconds === null) return null;
  const nanos = toNumber(record.nanos) ?? 0;
  return seconds * 1000 + Math.floor(nanos / 1_000_000);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === "object") {
    const maybeToNumber = (value as { toNumber?: unknown }).toNumber;
    if (typeof maybeToNumber === "function") {
      const parsed = maybeToNumber.call(value);
      return typeof parsed === "number" && Number.isFinite(parsed)
        ? parsed
        : null;
    }
  }
  return null;
}
