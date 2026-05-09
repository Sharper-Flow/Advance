import { basename } from "path";
import { z } from "zod";
import type { Store } from "../storage/store";
import {
  getTemporalWorkerAliveness,
  getTemporalWorkerDiagnostics,
  restartCurrentProjectTemporalWorker,
} from "../plugin-init";
import { getService, getStslStats, reinitStsl } from "../temporal/service";

import { getTemporalHealth } from "../temporal/health-probe";
import {
  buildProjectTaskQueue,
  buildChangeWorkflowId,
} from "../temporal/client";
import { checkAdvSearchAttributes } from "../temporal/observability";
import { registerMissingAdvSearchAttributes } from "../temporal/observability";
import { CHANGE_WORKFLOW_COMPAT_QUERY_NAMES } from "../temporal/contracts";
import { formatToolOutput } from "../utils/tool-output";

import {
  classifyQueueServiceability,
  probeTaskQueuePollers,
  type QueueServiceability,
} from "../temporal/queue-serviceability";
import { getProjectId } from "../utils/project-id";
import {
  formatTargetProjectContext,
  type TargetProjectOutputContext,
  withTargetPathStore,
} from "./target-project";

type SuspectWorkerLockReason =
  | "suspect_live_legacy_lock"
  | "suspect_live_unserviceable_lock";

type RestartFailureReason = SuspectWorkerLockReason | "worker_restart_failed";

function recommendPostRegistrationAction(input: {
  ok: boolean;
  createdCount: number;
  verificationStatus: "verified" | "unverified";
}): string {
  if (input.createdCount > 0 || input.verificationStatus === "unverified") {
    return "run adv_temporal_worker_restart (worker process only), then retry the failed workflow update or archive command; restart OpenCode for plugin tool-code drift";
  }
  if (!input.ok)
    return "run adv_temporal_diagnose and follow recommendedNextAction";
  return "retry the previously blocked Temporal tool; worker restart is not required";
}

const DEFAULT_WORKER_RESTART_VERIFY_TIMEOUT_MS = 10_000;
const WORKER_RESTART_VERIFY_POLL_MS = 250;

type TemporalHealthSnapshot = Awaited<ReturnType<typeof getTemporalHealth>>;

interface RestartServiceabilitySnapshot {
  health: TemporalHealthSnapshot;
  serviceability: QueueServiceability;
  workerDiagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>;
}

function readWorkerRestartVerifyTimeoutMs(): number {
  const raw = process.env.ADV_WORKER_RESTART_VERIFY_TIMEOUT_MS;
  if (!raw) return DEFAULT_WORKER_RESTART_VERIFY_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_WORKER_RESTART_VERIFY_TIMEOUT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function diagnosticsIncludeQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return worker.queues.some(
      (queue) => queue === expectedQueue && !failed.has(queue),
    );
  });
}

function diagnosticsShowAliveQueue(
  diagnostics: ReturnType<typeof getTemporalWorkerDiagnostics>,
  expectedQueue: string,
): boolean {
  return diagnostics.some((worker) => {
    const failed = new Set(worker.failedQueues);
    return (
      worker.alive &&
      worker.queues.some(
        (queue) => queue === expectedQueue && !failed.has(queue),
      )
    );
  });
}

function classifySuspectWorkerLock(input: {
  health: TemporalHealthSnapshot;
  queueServiceability?: QueueServiceability | null;
}): SuspectWorkerLockReason | undefined {
  const lock = input.health.worker_lock;
  if (!lock || input.queueServiceability?.status !== "not_serviceable") {
    return undefined;
  }
  if (lock.schema_version === 1) return "suspect_live_legacy_lock";
  return undefined;
}

async function buildRestartServiceabilitySnapshot(input: {
  projectId: string;
  expectedQueue: string;
  localOwnership: "owned" | "peer" | "unknown";
  health?: TemporalHealthSnapshot;
  bundle?: ReturnType<typeof getService>;
}): Promise<RestartServiceabilitySnapshot> {
  const [health, workerDiagnostics] = await Promise.all([
    input.health
      ? Promise.resolve(input.health)
      : getTemporalHealth(input.projectId),
    Promise.resolve(getTemporalWorkerDiagnostics()),
  ]);
  const bundle = input.bundle !== undefined ? input.bundle : getService();
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
  const localRegistered =
    health.registered_queues.includes(input.expectedQueue) ||
    diagnosticsIncludeQueue(workerDiagnostics, input.expectedQueue);
  const localWorkerAlive =
    getTemporalWorkerAliveness() ||
    diagnosticsShowAliveQueue(workerDiagnostics, input.expectedQueue);

  return {
    health,
    workerDiagnostics,
    serviceability: classifyQueueServiceability({
      projectId: input.projectId,
      expectedQueue: input.expectedQueue,
      localRegistered,
      localWorkerAlive,
      localOwnership: input.localOwnership,
      workerDiagnostics,
      serverPollerProbe,
      staleRunningWorkflowCount,
      staleQueueProbe: health.server_alive ? "ok" : "unavailable",
    }),
  };
}

async function waitForRestartServiceability(input: {
  projectId: string;
  expectedQueue: string;
  timeoutMs: number;
}): Promise<RestartServiceabilitySnapshot & { elapsedMs: number }> {
  const startedAt = Date.now();
  let lastSnapshot: RestartServiceabilitySnapshot;
  for (;;) {
    lastSnapshot = await buildRestartServiceabilitySnapshot({
      projectId: input.projectId,
      expectedQueue: input.expectedQueue,
      localOwnership: "owned",
    });
    const elapsedMs = Date.now() - startedAt;
    if (
      lastSnapshot.serviceability.status === "serviceable" ||
      elapsedMs >= input.timeoutMs
    ) {
      return { ...lastSnapshot, elapsedMs };
    }
    await sleep(
      Math.min(WORKER_RESTART_VERIFY_POLL_MS, input.timeoutMs - elapsedMs),
    );
  }
}

function getErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

function classifyRestartFailure(input: {
  error: unknown;
  snapshot: RestartServiceabilitySnapshot;
}): RestartFailureReason {
  if (getErrorCode(input.error) === "WORKER_LOCK_HELD") {
    const suspect = classifySuspectWorkerLock({
      health: input.snapshot.health,
      queueServiceability: input.snapshot.serviceability,
    });
    if (suspect) return suspect;
  }
  return "worker_restart_failed";
}

function restartFailureNextAction(reason: RestartFailureReason): string {
  if (reason === "suspect_live_legacy_lock") {
    return "Provide explicit approval evidence to reclaim the suspect live legacy v1 worker.lock, or restart the owning OpenCode session; then rerun adv_temporal_worker_restart.";
  }
  if (reason === "suspect_live_unserviceable_lock") {
    return "Provide explicit approval evidence to reclaim the suspect live unserviceable worker.lock, or restart the owning OpenCode session; then rerun adv_temporal_worker_restart. Do not use STSL reconnect for worker-registration failure.";
  }
  return "run adv_temporal_diagnose and follow recommendedNextAction";
}

export const temporalOpsTools = {
  adv_temporal_diagnose: {
    description:
      "Read-only Temporal recovery diagnostic for ADV: classifies server, STSL, worker, workflow, search-attribute, stale-queue, and last-error health with a recommended next action.",
    args: {
      changeId: z
        .string()
        .optional()
        .describe(
          "Optional change ID to check for a reachable change workflow",
        ),
    },
    execute: async (args: { changeId?: string }, store: Store) => {
      // Thin diagnostic: server-reachable + worker-alive only (T13 simplification)
      const projectId = store.paths.external
        ? basename(store.paths.external)
        : undefined;
      const health = await getTemporalHealth(projectId);
      const bundle = getService();
      const serverReachable = health.server_alive;
      const workerAlive = health.worker_alive;

      let changeWorkflow: { reachable: boolean; error?: string } | null = null;
      if (projectId && args.changeId && bundle) {
        try {
          const handle = bundle.client.workflow.getHandle(
            buildChangeWorkflowId(projectId, args.changeId),
          );
          await handle.query(CHANGE_WORKFLOW_COMPAT_QUERY_NAMES.bootstrap);
          changeWorkflow = { reachable: true };
        } catch (err) {
          changeWorkflow = {
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      const recommendedNextAction = !serverReachable
        ? "Temporal server is unreachable — check that the Temporal service is running"
        : !workerAlive
          ? "Temporal worker is not alive — run adv_temporal_restart to restart the worker"
          : "Temporal is healthy";

      return formatToolOutput({
        success: true,
        serverReachable,
        workerAlive,
        stslInitialized: bundle !== null,
        ...(changeWorkflow ? { changeWorkflow } : {}),
        recommendedNextAction,
      });
    },
  },

  adv_temporal_register_search_attributes: {
    description:
      "Register missing required ADV Temporal search attributes. Creates missing attributes only, refuses wrong-type mutations, and requires explicit user approval.",
    args: {
      approvedByUser: z
        .boolean()
        .describe("Must be true after explicit user approval"),
      approvalEvidence: z
        .string()
        .describe("How the user explicitly approved metadata registration"),
    },
    execute: async (
      args: { approvedByUser: boolean; approvalEvidence: string },
      _store: Store,
    ) => {
      if (!args.approvedByUser || args.approvalEvidence.trim().length === 0) {
        return formatToolOutput({
          success: false,
          error:
            "Explicit user approval is required to register Temporal search attributes.",
        });
      }

      const bundle = getService();
      if (!bundle) {
        return formatToolOutput({
          success: false,
          error:
            "Temporal service layer not initialized — cannot register search attributes",
        });
      }

      const result = await registerMissingAdvSearchAttributes(
        bundle.connection,
        bundle.namespace,
      );

      // Verify SAs are actually queryable after registration
      const verification = await checkAdvSearchAttributes(
        bundle.connection,
        bundle.namespace,
      );

      const nextAction = recommendPostRegistrationAction({
        ok: result.ok,
        createdCount: result.created.length,
        verificationStatus: result.verificationStatus,
      });

      return formatToolOutput({
        success: result.ok && verification.ok,
        namespace: bundle.namespace,
        approvalEvidence: args.approvalEvidence.trim(),
        result,
        verification: {
          ok: verification.ok,
          present: verification.present.map((a) => a.name),
          missing: verification.missing.map((a) => a.name),
          wrongType: verification.wrongType.map((a) => a.name),
        },
        nextAction,
        message:
          result.ok && verification.ok
            ? `ADV Temporal search attributes ready in namespace ${bundle.namespace}`
            : verification.ok
              ? `Registration succeeded but verification found issues: ${result.error ?? "unknown error"}`
              : `Registration completed but verification failed — ${verification.missing.length} SAs still missing`,
      });
    },
  },

  adv_temporal_reconnect: {
    description:
      "Reconnect the shared Temporal service layer (STSL) without mutating workflow state or restarting workers.",
    args: {
      target_path: z
        .string()
        .optional()
        .describe(
          "Optional absolute path to another ADV project. When provided, mutates that project through a Temporal-backed target store.",
        ),
      target_confirmed: z
        .literal(true)
        .optional()
        .describe(
          "Required for untrusted target_path mutation. Confirms the target project was explicitly approved.",
        ),
      confirmationEvidence: z
        .string()
        .optional()
        .describe(
          "Required with target_confirmed for untrusted target_path mutation. Cite user approval evidence.",
        ),
    },
    execute: async (
      {
        target_path,
        target_confirmed,
        confirmationEvidence,
      }: {
        target_path?: string;
        target_confirmed?: true;
        confirmationEvidence?: string;
      },
      store: Store,
    ) => {
      const runReconnect = async (
        _activeStore: Store,
        projectContext?: TargetProjectOutputContext,
      ) => {
        const before = getStslStats();
        try {
          await reinitStsl();
        } catch (err) {
          const after = getStslStats();
          return formatToolOutput({
            success: false,
            before,
            after,
            error: err instanceof Error ? err.message : String(err),
            message: "Temporal service layer reconnect failed",
            ...(projectContext ? { _projectContext: projectContext } : {}),
          });
        }
        const after = getStslStats();
        return formatToolOutput({
          success: true,
          before,
          after,
          message: "Reconnected Temporal service layer",
          ...(projectContext ? { _projectContext: projectContext } : {}),
        });
      };

      if (target_path) {
        return withTargetPathStore(
          {
            currentProjectPath: store.paths.root,
            target_path,
            stateRequirement: "temporal-required",
            target_confirmed,
            confirmationEvidence,
          },
          async ({ context, store: targetStore }) =>
            runReconnect(targetStore, formatTargetProjectContext(context)),
        );
      }

      return runReconnect(store);
    },
  },

  adv_temporal_worker_restart: {
    description:
      "Restart the project's Temporal worker process (out-of-process Node child on Bun hosts; in-process on Node hosts). Use when the worker is wedged or the respawn loop is exhausted. Does NOT reload plugin tool code in `plugin/src/tools/*.ts`; restart OpenCode itself to reload those host-loaded modules. If workflow or activity code in `plugin/src/temporal/` changed, run `pnpm run build:worker` before this tool because the worker loads from `dist/temporal/`. Waits up to 10s for the expected queue to become serviceable and returns structured diagnostics on timeout/failure.",
    args: {
      approvedLockReclaim: z
        .literal(true)
        .optional()
        .describe(
          "Set only after explicit user approval to reclaim a suspect live v1/v2 worker.lock when queue serviceability cannot be proven.",
        ),
      approvalEvidence: z
        .string()
        .optional()
        .describe(
          "Required with approvedLockReclaim:true. Cite the user's explicit approval evidence.",
        ),
    },
    execute: async (
      args: { approvedLockReclaim?: true; approvalEvidence?: string },
      store: Store,
    ) => {
      const approvedLockReclaim = args.approvedLockReclaim === true;
      const approvalEvidence = args.approvalEvidence?.trim();
      if (approvedLockReclaim && !approvalEvidence) {
        return formatToolOutput({
          success: false,
          errorClass: "ApprovalRequired",
          error: "approvalEvidence is required when approvedLockReclaim:true.",
          recommendedNextAction:
            "Ask the user for explicit approval evidence before reclaiming a suspect live v1/v2 worker.lock.",
        });
      }

      const projectId = store.paths.external
        ? basename(store.paths.external)
        : await getProjectId(store.paths.root);
      if (!projectId) {
        return formatToolOutput({
          success: false,
          errorClass: "ProjectIdUnavailable",
          error:
            "Cannot restart Temporal worker: no projectId for current directory",
        });
      }

      const expectedQueue = buildProjectTaskQueue(projectId);
      const stats = getStslStats();
      let restartResult: Awaited<
        ReturnType<typeof restartCurrentProjectTemporalWorker>
      >;
      try {
        restartResult = await restartCurrentProjectTemporalWorker(
          store.paths.root,
          {
            approvedLockReclaim,
            approvalEvidence,
          },
        );
      } catch (error) {
        const snapshot = await buildRestartServiceabilitySnapshot({
          projectId,
          expectedQueue,
          localOwnership: "peer",
        });
        const reason = classifyRestartFailure({ error, snapshot });
        return formatToolOutput({
          success: false,
          errorClass:
            reason === "worker_restart_failed"
              ? "WorkerRestartFailed"
              : "ApprovalRequired",
          reason,
          approvalRequired: reason !== "worker_restart_failed",
          error: error instanceof Error ? error.message : String(error),
          projectId,
          expectedQueue,
          serviceability: snapshot.serviceability,
          temporalHealth: snapshot.health,
          workerDiagnostics: snapshot.workerDiagnostics,
          worker_lock: snapshot.health.worker_lock,
          stsl: {
            initialized: getService() !== null,
            reconnectCount: stats.reconnectCount,
            reconnectFailureCount: stats.reconnectFailureCount,
          },
          recommendedNextAction: restartFailureNextAction(reason),
        });
      }

      const verification = await waitForRestartServiceability({
        projectId: restartResult.projectId,
        expectedQueue: restartResult.expectedQueue ?? expectedQueue,
        timeoutMs: readWorkerRestartVerifyTimeoutMs(),
      });

      if (verification.serviceability.status !== "serviceable") {
        return formatToolOutput({
          success: false,
          errorClass: "WorkerRestartVerificationTimeout",
          message:
            "Temporal worker restart completed, but expected queue serviceability was not proven within the verification budget.",
          projectId: restartResult.projectId,
          expectedQueue: restartResult.expectedQueue ?? expectedQueue,
          queues: restartResult.queues,
          serviceability: verification.serviceability,
          temporalHealth: verification.health,
          workerDiagnostics: verification.workerDiagnostics,
          worker_lock: verification.health.worker_lock,
          elapsedMs: verification.elapsedMs,
          stsl: {
            initialized: getService() !== null,
            reconnectCount: stats.reconnectCount,
            reconnectFailureCount: stats.reconnectFailureCount,
          },
          recommendedNextAction:
            "run adv_temporal_diagnose and follow recommendedNextAction; do not assume restart succeeded",
        });
      }

      return formatToolOutput({
        success: true,
        projectId: restartResult.projectId,
        expectedQueue: restartResult.expectedQueue ?? expectedQueue,
        queues: restartResult.queues,
        serviceability: verification.serviceability,
        workerDiagnostics: verification.workerDiagnostics,
        elapsedMs: verification.elapsedMs,
        message:
          "Temporal worker restart verified: expected queue is serviceable.",
        recommendedNextAction: "retry the blocked ADV command",
        stsl: {
          initialized: getService() !== null,
          reconnectCount: stats.reconnectCount,
          reconnectFailureCount: stats.reconnectFailureCount,
        },
      });
    },
  },
};
