import { basename, dirname } from "path";
import {
  buildProjectTaskQueue,
  buildProjectWorkflowId,
  getTemporalAddress,
  type TemporalClientBundle,
} from "../temporal/client";
import { getService } from "../temporal/service";
import { canReachTemporalAddress } from "../temporal/runtime-manager";
import {
  getRegisteredTemporalWorkerQueues,
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
  restartCurrentProjectTemporalWorker,
} from "../plugin-init";
import { getProjectId } from "../utils/project-id";
import { getTemporalHealth } from "../temporal/health-probe";
import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { ensureProjectWorkflowStarted } from "../temporal/migration";
import { createLogger } from "../utils/debug-log";

const logger = createLogger("project-workflow-helper");

interface WorkflowHandleLike {
  query: (definition: unknown, ...args: unknown[]) => Promise<unknown>;
  executeUpdate: (
    definition: unknown,
    options: { args?: unknown[] },
  ) => Promise<unknown>;
}

export type ProjectWorkflowAccess =
  | {
      mode: "local-only";
      projectId: string | null;
      reason: string;
    }
  | {
      mode: "unavailable";
      projectId: string;
      reason: string;
      recommendedNextAction?: string;
      queueServiceability?: QueueServiceability;
    }
  | {
      mode: "workflow-backed";
      projectId: string;
      bundle: TemporalClientBundle;
      handle: WorkflowHandleLike;
    };

function isExternalMutablePath(path?: string): boolean {
  return Boolean(path && !path.includes("/.adv/"));
}

export interface GetBoundedProjectWorkflowAccessInput {
  projectDir: string;
  mutablePath?: string;
  timeoutMs?: number;
  /**
   * Bounded recovery strategy when the worker readiness check fails:
   * - `"once"`: run a single non-approval `restartCurrentProjectTemporalWorker`
   *   attempt, re-check readiness, and emit rich diagnostics on failure.
   *   Suspect live legacy-v1 lock failures surface a `recommendedNextAction`
   *   requiring explicit approval; never retried silently and never
   *   recommend in-place edits as a fallback (rq-workerSingleton01.6).
   * - `"none"` (default): return `unavailable` on the first failed readiness
   *   check without attempting recovery — preserves the historical behavior
   *   for read-only and non-worktree-creation seams.
   */
  recovery?: "once" | "none";
}

export async function getBoundedProjectWorkflowAccess(
  input: GetBoundedProjectWorkflowAccessInput,
): Promise<ProjectWorkflowAccess> {
  const projectId = isExternalMutablePath(input.mutablePath)
    ? basename(dirname(input.mutablePath!))
    : await getProjectId(input.projectDir);

  if (!projectId) {
    return {
      mode: "local-only",
      projectId: null,
      reason: "No project workflow identity available",
    };
  }

  if (!isExternalMutablePath(input.mutablePath)) {
    return {
      mode: "local-only",
      projectId,
      reason: "Workflow-backed mode not expected for local mutable paths",
    };
  }

  const address = getTemporalAddress(process.env);
  const timeoutMs = input.timeoutMs ?? 250;
  const reachable = await canReachTemporalAddress(address, timeoutMs);
  if (!reachable) {
    return {
      mode: "unavailable",
      projectId,
      reason: `Temporal server at ${address} unreachable within ${timeoutMs}ms`,
    };
  }

  const expectedQueue = buildProjectTaskQueue(projectId);

  if (isWorkerReadyFor(expectedQueue)) {
    return buildWorkflowBackedWithBootstrap(projectId, input.projectDir);
  }

  // GH#34: No local worker, but a peer session's worker may be
  // servicing the queue server-side. Probe the Temporal server for
  // active pollers before falling through to bounded recovery (which
  // tries to restart the local worker and fails with WORKER_LOCK_HELD
  // when a peer holds the lock).
  const bundle = getService();
  if (bundle) {
    try {
      const serverProbe = await probeTaskQueuePollers({
        connection: bundle.connection as unknown as Parameters<
          typeof probeTaskQueuePollers
        >[0]["connection"],
        namespace: bundle.namespace,
        taskQueue: expectedQueue,
      });
      if (
        (serverProbe.status === "fresh" || serverProbe.status === "stale") &&
        serverProbe.lastAccessMs !== null
      ) {
        return buildWorkflowBackedWithBootstrap(projectId, input.projectDir);
      }
    } catch {
      // Server probe failed — fall through to recovery path
    }
  }

  if (input.recovery === "once") {
    return runBoundedRecovery({
      projectDir: input.projectDir,
      projectId,
      expectedQueue,
    });
  }

  return {
    mode: "unavailable",
    projectId,
    reason: `Temporal worker not ready for queue ${expectedQueue}`,
  };
}

function isWorkerReadyFor(expectedQueue: string): boolean {
  // Match the historical eager-call pattern so test mocks that
  // sequence `.mockReturnValueOnce(...)` on both helpers see one call
  // each per readiness check.
  const queues = getRegisteredTemporalWorkerQueues();
  const alive = getTemporalWorkerAliveness();
  return alive && queues.includes(expectedQueue);
}

function _buildWorkflowBacked(projectId: string): ProjectWorkflowAccess {
  const bundle = getService();
  if (!bundle) {
    return {
      mode: "unavailable",
      projectId,
      reason: "Temporal service layer not initialized",
    };
  }
  return {
    mode: "workflow-backed",
    projectId,
    bundle,
    handle: bundle.client.workflow.getHandle(
      buildProjectWorkflowId(projectId),
    ) as unknown as WorkflowHandleLike,
  };
}

/**
 * Attempt to auto-bootstrap a missing project workflow before returning
 * the handle. If bootstrap succeeds, returns workflow-backed. If it
 * fails, returns unavailable with a clear reason.
 *
 * GH#31: The primary bootstrap path is in tryInitStore (fire-and-forget
 * at plugin startup). This is a secondary sync path for tools that need
 * the project workflow and discover it missing at call time.
 */
async function buildWorkflowBackedWithBootstrap(
  projectId: string,
  _projectDir: string,
): Promise<ProjectWorkflowAccess> {
  const bundle = getService();
  if (!bundle) {
    return {
      mode: "unavailable",
      projectId,
      reason: "Temporal service layer not initialized",
    };
  }

  // Try to ensure the project workflow exists before returning the handle.
  try {
    await ensureProjectWorkflowStarted(
      {
        workflow: bundle.client
          .workflow as unknown as import("../temporal/migration").WorkflowClientLike,
      },
      {
        projectId,
        initializedAt: new Date().toISOString(),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If already started, that's fine — the handle below will work.
    if (!/already started|already exists/i.test(msg)) {
      logger.debug(
        `Project workflow bootstrap failed for ${projectId}: ${msg}`,
      );
      return {
        mode: "unavailable",
        projectId,
        reason: `Project workflow bootstrap failed: ${msg}`,
        recommendedNextAction:
          "Restart the OpenCode session to trigger auto-bootstrap, or run adv_temporal_diagnose for detailed health check",
      };
    }
  }

  return {
    mode: "workflow-backed",
    projectId,
    bundle,
    handle: bundle.client.workflow.getHandle(
      buildProjectWorkflowId(projectId),
    ) as unknown as WorkflowHandleLike,
  };
}

async function runBoundedRecovery(input: {
  projectDir: string;
  projectId: string;
  expectedQueue: string;
}): Promise<ProjectWorkflowAccess> {
  let recoveryError: unknown = null;
  try {
    // rq-workerSingleton01.6 — never reclaim a live legacy-v1 lock without
    // explicit approval; bounded helper recovery is non-approval only.
    await restartCurrentProjectTemporalWorker(input.projectDir, {
      approvedLockReclaim: false,
      approvalEvidence: undefined,
    });
  } catch (err) {
    recoveryError = err;
  }

  if (recoveryError === null && isWorkerReadyFor(input.expectedQueue)) {
    return buildWorkflowBackedWithBootstrap(input.projectId, input.projectDir);
  }

  // Recovery failed or did not produce a serviceable worker. Build rich
  // diagnostics so callers can present an actionable next action instead of
  // silently degrading to in-place behavior.
  const { snapshot, health } = await buildPostRecoveryServiceability({
    projectId: input.projectId,
    expectedQueue: input.expectedQueue,
  });

  const suspectLockReason =
    getErrorCode(recoveryError) === "WORKER_LOCK_HELD"
      ? classifySuspectWorkerLock({ health, serviceability: snapshot })
      : undefined;

  if (suspectLockReason) {
    const label =
      suspectLockReason === "suspect_live_legacy_lock"
        ? "suspect live legacy v1 worker.lock"
        : "suspect live unserviceable worker.lock";
    return {
      mode: "unavailable",
      projectId: input.projectId,
      reason:
        `Temporal worker not ready for queue ${input.expectedQueue}: ` +
        `${label} — explicit approval is required ` +
        `to reclaim it, or restart the owning OpenCode session; do not retry ` +
        `in this session`,
      recommendedNextAction:
        `Provide explicit approval evidence to reclaim the ${label}, or ` +
        "restart the owning OpenCode session; then rerun " +
        "adv_temporal_worker_restart with approvedLockReclaim+approvalEvidence. " +
        "Do not use STSL reconnect for worker-registration failure.",
      queueServiceability: snapshot,
    };
  }

  const errorMessage =
    recoveryError instanceof Error
      ? recoveryError.message
      : recoveryError !== null
        ? String(recoveryError)
        : "post-recovery readiness check still unavailable";
  return {
    mode: "unavailable",
    projectId: input.projectId,
    reason: `Temporal worker not ready for queue ${input.expectedQueue} after bounded recovery: ${errorMessage}`,
    recommendedNextAction:
      "Run adv_temporal_diagnose, follow recommendedNextAction, then rerun the blocked command",
    queueServiceability: snapshot,
  };
}

async function buildPostRecoveryServiceability(input: {
  projectId: string;
  expectedQueue: string;
}): Promise<{
  snapshot: QueueServiceability;
  health: Awaited<ReturnType<typeof getTemporalHealth>>;
}> {
  const [health, workerDiagnostics] = await Promise.all([
    getTemporalHealth(input.projectId),
    Promise.resolve(getTemporalWorkerDiagnostics()),
  ]);
  const bundle = getService();
  const serverPollerProbe = bundle
    ? await probeTaskQueuePollers({
        connection: bundle.connection as unknown as Parameters<
          typeof probeTaskQueuePollers
        >[0]["connection"],
        namespace: bundle.namespace,
        taskQueue: input.expectedQueue,
      })
    : {
        status: "unavailable" as const,
        lastAccessMs: null,
        error: "Temporal service layer not initialized",
      };
  const staleRunningWorkflowCount = health.stale_queues
    .filter((queue) => queue.queue === input.expectedQueue)
    .reduce((total, queue) => total + queue.running_count, 0);
  const localRegistered = getRegisteredTemporalWorkerQueues().includes(
    input.expectedQueue,
  );
  const localWorkerAlive = getTemporalWorkerAliveness();
  const localOwnership: "owned" | "peer" | "unknown" = !health.worker_lock
    ? "unknown"
    : health.worker_lock.holder_pid === process.pid
      ? "owned"
      : "peer";

  const snapshot = classifyQueueServiceability({
    projectId: input.projectId,
    expectedQueue: input.expectedQueue,
    localRegistered,
    localWorkerAlive,
    localOwnership,
    workerDiagnostics,
    serverPollerProbe,
    staleRunningWorkflowCount,
    staleQueueProbe: health.server_alive ? "ok" : "unavailable",
  });
  return { snapshot, health };
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function classifySuspectWorkerLock(input: {
  health: Awaited<ReturnType<typeof getTemporalHealth>>;
  serviceability: QueueServiceability;
}): "suspect_live_legacy_lock" | "suspect_live_unserviceable_lock" | undefined {
  const lock = input.health.worker_lock;
  if (!lock || input.serviceability.status !== "not_serviceable") {
    return undefined;
  }
  if (lock.schema_version === 1) return "suspect_live_legacy_lock";
  return undefined;
}
