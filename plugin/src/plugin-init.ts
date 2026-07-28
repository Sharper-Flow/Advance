/**
 * Plugin Init & Shutdown Helpers
 *
 * Hosts the init try/catch and process-shutdown handlers so index.ts stays
 * focused on lifecycle, hooks, and the public Plugin contract.
 *
 * Resilience contract: if createStore() or store.init() throws, the plugin
 * MUST still return a usable Hooks object. Otherwise OpenCode drops every
 * adv_* tool from the session silently and agents see "tools unavailable"
 * with no diagnostic path. Callers register a degraded tool map (via
 * createDegradedToolMap) when initError is non-null.
 */

import { Client } from "@temporalio/client";
import { createStore } from "./storage/store";
import type { Store } from "./storage/store-types";
import { loadProjectConfig } from "./storage/json";
import {
  buildProjectTaskQueue,
  buildSessionTaskQueue,
} from "./temporal/client";
import { initStsl, closeStsl, getService } from "./temporal/service";
import {
  createInProcessWorker,
  type InProcessWorker,
} from "./temporal/in-process-worker";
import { createOutOfProcessWorker } from "./temporal/out-of-process-worker";
import {
  OrphanQueueAdopter,
  describeError,
  isOrphanQueueAdoptionEnabled,
  type OrphanQueueAdoptionDiagnostics,
} from "./temporal/orphan-queue-adopter";
import {
  ensureTemporalRuntime,
  probeTemporalWorkerRuntime,
  resolveNodeExecutable,
} from "./temporal/runtime-manager";
import {
  composeWorkerHealthProbe,
  createHealthMonitor,
  type HealthMonitor,
} from "./temporal/health-monitor";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";
import { cleanup as cleanupTerminal } from "./events";
import {
  appendDebugLog,
  appendProfileLog,
  createLogger,
} from "./utils/debug-log";
import { getExternalRoot, getProjectId } from "./utils/project-id";
import { generateSessionId } from "./utils/session-id";
import { getCurrentSessionId, setCurrentSessionId } from "./utils/session-id";
import {
  registerPluginSession,
  unregisterLoadedBuildSession,
} from "./migration/session-registry";
import {
  resolveMigrationRoot,
  resolveOwnBuildIdentity,
} from "./migration/paths";
import { recordWorkerRunFailure } from "./temporal/retry-wrapper";
import { resolveProductContext } from "./storage/product-context";
import {
  tryReclaimStaleLock,
  type ReclaimWorkerLockOptions,
  type WorkerLockResult,
} from "./temporal/worker-lock";
import {
  startWorkerLockHeartbeat,
  type WorkerLockHeartbeatController,
} from "./temporal/worker-heartbeat";
import {
  initWorkerBundleRoll,
  type WorkerBundleRollMonitor,
} from "./temporal/worker-roll";

const debugLog = (msg: string): void => appendDebugLog("plugin-init", msg);
const logger = createLogger("plugin-init");

// Re-exported for historical callers that imported getCurrentSessionId from
// plugin-init. The actual holder lives in utils/session-id.ts to avoid an
// import cycle (storage layer needs to read it; plugin-init imports storage).
export { getCurrentSessionId } from "./utils/session-id";

function profilePluginInit(
  event: string,
  meta: Record<string, unknown> = {},
): void {
  appendProfileLog("plugin-init", { event, ...meta });
}

export interface StoreInitResult {
  store: Store | null;
  initError: Error | null;
}

export type WorkerRole = "host" | "client" | "degraded";

export interface WorkerSingletonPlanOptions extends Omit<
  ReclaimWorkerLockOptions,
  "schemaVersion" | "expectedQueue"
> {
  projectStateDir: string;
  expectedQueue: string;
  workerSingletonEnforce: boolean;
  forceInProcessWorker?: boolean;
}

export interface WorkerSingletonPlan {
  shouldSpawnWorker: boolean;
  workerRole: WorkerRole;
  lockResult?: WorkerLockResult;
}

export async function resolveWorkerSingletonPlan(
  options: WorkerSingletonPlanOptions,
): Promise<WorkerSingletonPlan> {
  if (options.forceInProcessWorker || !options.workerSingletonEnforce) {
    return { shouldSpawnWorker: true, workerRole: "host" };
  }

  const lockResult = await tryReclaimStaleLock(options.projectStateDir, {
    ...options,
    schemaVersion: 2,
    expectedQueue: options.expectedQueue,
  });

  return {
    shouldSpawnWorker: lockResult.owned,
    workerRole: lockResult.owned ? "host" : "client",
    lockResult,
  };
}

function buildTemporalClientEnv(input: {
  address: string;
  namespace: string;
}): NodeJS.ProcessEnv {
  return {
    ADV_TEMPORAL_ADDRESS: input.address,
    ADV_TEMPORAL_NAMESPACE: input.namespace,
    ...(process.env.ADV_TEMPORAL_ALLOW_REMOTE
      ? { ADV_TEMPORAL_ALLOW_REMOTE: process.env.ADV_TEMPORAL_ALLOW_REMOTE }
      : {}),
  };
}

function readBooleanFeatureFlag(
  features: unknown,
  key: string,
  defaultValue: boolean,
): boolean {
  if (!features || typeof features !== "object") return defaultValue;
  const value = (features as Record<string, unknown>)[key];
  return typeof value === "boolean" ? value : defaultValue;
}

/**
 * Resolve the worker script path used by the OOP Node child process.
 *
 * Prefers the built bundle (`dist/temporal/worker.js`) next to the plugin
 * distribution — that path is guaranteed to be resolvable from a Node child
 * regardless of the plugin host runtime. Falls back to the source file when
 * running from source (dev) where the built bundle doesn't exist.
 */
function resolveWorkerScriptPath(): string {
  // Use import.meta.url so the calculation works whether the plugin is loaded
  // from src/plugin-init.ts (dev / Bun source-mode) or dist/index.js (built
  // bundle). `../dist/temporal/worker.js` resolves to the same final path from
  // both locations:
  //   - src/plugin-init.ts  -> plugin/dist/temporal/worker.js
  //   - dist/index.js       -> plugin/dist/temporal/worker.js
  const distPath = fileURLToPath(
    new URL("../dist/temporal/worker.js", import.meta.url),
  );
  if (!existsSync(distPath)) {
    throw new Error(
      `Temporal worker bundle not found at ${distPath}. Run \`pnpm run build:worker\` in plugin/ before starting the out-of-process worker, or install a built plugin bundle.`,
    );
  }
  return distPath;
}

export async function tryInitStore(
  effectiveDir: string,
  _externalRoot: string | undefined,
): Promise<StoreInitResult> {
  const initStartedAt = performance.now();
  let worker: InProcessWorker | undefined;
  let workerHeartbeat: WorkerLockHeartbeatController | undefined;
  let workerBundleRollMonitor: WorkerBundleRollMonitor | undefined;

  try {
    const projectIdStartedAt = performance.now();
    const productContext = await resolveProductContext(effectiveDir);
    const projectId = productContext.productProjectId;
    const productExternalRoot = getExternalRoot(projectId);
    profilePluginInit("project_id_resolved", {
      duration_ms: Number((performance.now() - projectIdStartedAt).toFixed(3)),
      hasProjectId: Boolean(projectId),
      repoProjectId: productContext.repoProjectId,
      productProjectId: productContext.productProjectId,
      productMode: productContext.mode,
    });

    const sessionId = getCurrentSessionId() ?? generateSessionId();
    setCurrentSessionId(sessionId);

    // rq-advOwnedFrontmatterValid01 / DDC1: bounded runtime frontmatter
    // check. Warn-only, never throws — init resilience takes precedence.
    try {
      const { runtimeFrontmatterCheck } =
        await import("./utils/manifest-frontmatter");
      runtimeFrontmatterCheck(300);
    } catch {
      // Swallow — frontmatter check is advisory at init time.
    }

    let temporalBundle: Awaited<ReturnType<typeof initStsl>> | undefined;
    profilePluginInit("backend_mode_detected", {
      backend_mode: "temporal",
    });
    if (projectId) {
      // AC9/DDC5: record this session's loaded-build identity into the
      // machine-wide cutover registry. Self-guarding (skips in test mode
      // and src/dev mode without a build identity) and never throws — the
      // init resilience contract takes precedence over registration.
      registerPluginSession({
        projectId,
        migrationRoot: resolveMigrationRoot(),
        identity: resolveOwnBuildIdentity(),
        sessionId,
      });
      const runtimeStartedAt = performance.now();
      const runtime = await ensureTemporalRuntime(projectId);
      profilePluginInit("temporal_runtime_ready", {
        duration_ms: Number((performance.now() - runtimeStartedAt).toFixed(3)),
        startedRuntime: runtime.startedRuntime,
      });

      const workerProbe = probeTemporalWorkerRuntime();
      profilePluginInit("worker_runtime_probed", {
        runtime: workerProbe.runtime,
        supported: workerProbe.supported,
      });

      // Signal-driven workflows allow multiple local workers to share the
      // project queue. No peer lock / heartbeat coordination is needed here.
      const projectStateDir = productExternalRoot;
      const expectedQueue = buildProjectTaskQueue(projectId);
      // KD-2 / rq-isolSessionTaskQueue01 / rq-isolSessionTaskQueue02: when
      // sessionId is available,
      // the worker polls BOTH its own-session queue (advance-{P}-{sess})
      // and the permanent project queue (advance-{P}). The project queue
      // is co-polled for epic workflows (UD2) and legacy change workflows
      // still routing to it during migration (KD-4).
      const sessionQueue = sessionId
        ? buildSessionTaskQueue(projectId, sessionId)
        : undefined;
      const workerQueues = sessionQueue
        ? [sessionQueue, expectedQueue]
        : [expectedQueue];
      const projectConfig = await loadProjectConfig(effectiveDir).catch(
        () => null,
      );
      const workerSingletonEnforce = readBooleanFeatureFlag(
        projectConfig?.features,
        "worker_singleton_enforce",
        true,
      );
      const singletonPlan = await resolveWorkerSingletonPlan({
        projectStateDir,
        expectedQueue,
        workerSingletonEnforce,
        forceInProcessWorker: process.env.ADV_FORCE_IN_PROCESS_WORKER === "1",
      });
      currentWorkerRole = singletonPlan.workerRole;
      const shouldSpawnWorker = singletonPlan.shouldSpawnWorker;
      profilePluginInit("worker_singleton_resolved", {
        enforce: workerSingletonEnforce,
        forceInProcessWorker: process.env.ADV_FORCE_IN_PROCESS_WORKER === "1",
        workerRole: singletonPlan.workerRole,
        owned: singletonPlan.lockResult?.owned,
        ownerPid: singletonPlan.lockResult?.ownerPid,
      });

      if (shouldSpawnWorker) {
        let spawnedWorker: InProcessWorker | undefined;
        if (singletonPlan.lockResult?.owned) {
          workerHeartbeat = startWorkerLockHeartbeat(projectStateDir, {
            isServiceable: () =>
              spawnedWorker
                ? isWorkerServiceable(spawnedWorker, expectedQueue)
                : true,
            // Fire-and-forget: the drift check single-flights internally;
            // beats must never block on a roll.
            onBeat: () => {
              void workerBundleRollMonitor?.checkNow().catch(() => undefined);
            },
          });
          registerWorkerLockHeartbeat(workerHeartbeat);
        }
        const onWorkerExhausted = async (): Promise<void> => {
          await handleWorkerExhausted(projectStateDir, spawnedWorker);
        };
        if (workerProbe.supported) {
          const workerStartedAt = performance.now();
          spawnedWorker = await createInProcessWorker({
            address: runtime.address,
            namespace: runtime.namespace,
            queues: workerQueues,
            artifactPolicy: {
              mode: "production_verified",
              bundleDir: dirname(resolveWorkerScriptPath()),
            },
            onWorkerExhausted,
          });
          worker = spawnedWorker;
          profilePluginInit("worker_started", {
            duration_ms: Number(
              (performance.now() - workerStartedAt).toFixed(3),
            ),
            worker_model: "in_process",
          });
        } else {
          const nodeResolution = resolveNodeExecutable();
          profilePluginInit("worker_node_resolution", {
            found: nodeResolution.found,
            source: nodeResolution.source,
          });
          if (!nodeResolution.found) {
            profilePluginInit("worker_node_missing", {
              worker_runtime: workerProbe.runtime,
            });
            throw new Error(
              `Temporal worker cannot run under ${workerProbe.runtime}. ${nodeResolution.remediation ?? "Install Node on PATH or set ADV_NODE_PATH."}`,
            );
          }
          const workerStartedAt = performance.now();
          const workerScriptPath = resolveWorkerScriptPath();
          const outOfProcessWorker = await createOutOfProcessWorker({
            address: runtime.address,
            namespace: runtime.namespace,
            queues: workerQueues,
            workerScript: workerScriptPath,
            projectId,
            sessionId,
            onWorkerExhausted,
          });
          spawnedWorker = outOfProcessWorker;
          worker = spawnedWorker;

          // OOP-only bundle drift self-roll (owner-driven). The child was
          // just spawned from the current bundle and passed its ready
          // handshake — hand the current generation to the heartbeat (the
          // sole worker.lock writer) so it is stamped atomically
          // post-readiness, then converge on every heartbeat beat.
          // In-process workers share the host's bundle and never drift,
          // so they skip this.
          workerBundleRollMonitor = await initWorkerBundleRoll({
            projectStateDir,
            bundleDir: dirname(workerScriptPath),
            restartChild: () => outOfProcessWorker.restartChild(),
            verifyCandidateBundle: async ({ workflowsPath, historiesDir }) => {
              const { verifyCommittedReplayFixtures } =
                await import("./migration/replay-verification");
              return verifyCommittedReplayFixtures({
                workflowsPath,
                historiesDir,
                replayNamePrefix: "self-roll-gate",
              });
            },
            stampBundleGeneration: async (generation) => {
              await workerHeartbeat?.stampBundleGeneration(generation);
            },
            onRollError: (err) =>
              debugLog(`worker bundle roll failed: ${err.message}`),
          }).catch((err) => {
            debugLog(
              `worker bundle roll monitor unavailable: ${err instanceof Error ? err.message : String(err)}`,
            );
            return undefined;
          });

          profilePluginInit("worker_started", {
            duration_ms: Number(
              (performance.now() - workerStartedAt).toFixed(3),
            ),
            worker_model: "out_of_process",
          });
        }
      }

      const bundleStartedAt = performance.now();
      temporalBundle = await initStsl(
        buildTemporalClientEnv({
          address: runtime.address,
          namespace: runtime.namespace,
        }),
      );
      profilePluginInit("temporal_client_ready", {
        duration_ms: Number((performance.now() - bundleStartedAt).toFixed(3)),
      });
      if (worker) {
        attachWorkerWithAdoption(worker, {
          projectId,
          client: temporalBundle?.client ?? null,
        });
      }
    }

    const storeCreateStartedAt = performance.now();
    const store = await createStore(effectiveDir, {
      externalRoot: productExternalRoot,
      projectIdOverride: projectId ?? undefined,
      productContext,
      temporalBundle: temporalBundle!,
    });
    profilePluginInit("store_created", {
      duration_ms: Number(
        (performance.now() - storeCreateStartedAt).toFixed(3),
      ),
      backend_mode: "temporal",
    });

    const storeInitStartedAt = performance.now();
    await store.init();
    profilePluginInit("store_initialized", {
      duration_ms: Number((performance.now() - storeInitStartedAt).toFixed(3)),
    });

    profilePluginInit("try_init_store_complete", {
      duration_ms: Number((performance.now() - initStartedAt).toFixed(3)),
      backend_mode: "temporal",
      outcome: "success",
    });

    return { store, initError: null };
  } catch (e) {
    const initError = e instanceof Error ? e : new Error(String(e));
    debugLog(`Plugin init FAILED: ${initError.message}`);
    profilePluginInit("try_init_store_failed", {
      duration_ms: Number((performance.now() - initStartedAt).toFixed(3)),
      outcome: "error",
      errorClass: initError.name || "Error",
      message: initError.message,
    });

    if (worker) {
      try {
        await worker.shutdown();
      } catch (shutdownError) {
        debugLog(
          `Error shutting down worker after init failure: ${shutdownError instanceof Error ? shutdownError.message : String(shutdownError)}`,
        );
      }
    }
    if (workerHeartbeat) {
      try {
        await workerHeartbeat.stop();
      } catch (heartbeatError) {
        debugLog(
          `Error stopping worker heartbeat after init failure: ${heartbeatError instanceof Error ? heartbeatError.message : String(heartbeatError)}`,
        );
      }
    }

    logger.info(
      `Plugin init failed: ${initError.message} — adv_* tools are stubbed and will report ADV_PLUGIN_INIT_FAILED until the cause is fixed.`,
    );

    return { store: null, initError };
  }
}

const inProcessTemporalWorkers = new Set<InProcessWorker>();
const workerLockHeartbeats = new Set<WorkerLockHeartbeatController>();
let currentWorkerRole: WorkerRole = "degraded";

/** Module-level adopter reference for diagnostics + heartbeat callback. */
let activeOrphanQueueAdopter: OrphanQueueAdopter | null = null;

export type AdoptionConstructionState =
  | { kind: "not_attempted" }
  | { kind: "active"; adopter: OrphanQueueAdopter }
  | { kind: "unavailable"; reason: string }
  | { kind: "disabled" }
  | { kind: "driver_error"; lastError: string; since: number }
  | { kind: "construction_failed"; lastError: string };

let adoptionConstructionState: AdoptionConstructionState = {
  kind: "not_attempted",
};

interface WorkerAdoptionAttachment {
  worker: InProcessWorker;
  adopter: OrphanQueueAdopter | null;
  stopDriver: (() => void) | null;
}

const workerAdoptionAttachments = new Map<
  InProcessWorker,
  WorkerAdoptionAttachment
>();

function teardownWorkerAttachment(worker: InProcessWorker): void {
  const attachment = workerAdoptionAttachments.get(worker);
  if (attachment) {
    attachment.stopDriver?.();
    workerAdoptionAttachments.delete(worker);
  }
}

/** Test-only accessor for the number of live worker adoption attachments. */
export function getWorkerAdoptionAttachmentCount(): number {
  return workerAdoptionAttachments.size;
}

/**
 * Return orphan-queue adoption diagnostics for adv_doctor +
 * adv_status health view (rq-isolSessionTaskQueue05 / AC7).
 */
export function getOrphanQueueAdoptionDiagnostics(): OrphanQueueAdoptionDiagnostics | null {
  return activeOrphanQueueAdopter?.getDiagnostics() ?? null;
}

export interface OrphanQueueAdoptionStatus {
  enabled: boolean;
  diagnostics: OrphanQueueAdoptionDiagnostics | null;
  /** Present when enabled is false — distinguishes kill-switch / no-client / not-attached. */
  reason?: string;
}

export function getOrphanQueueAdoptionStatus(): OrphanQueueAdoptionStatus {
  switch (adoptionConstructionState.kind) {
    case "active":
      return {
        enabled: true,
        diagnostics: adoptionConstructionState.adopter.getDiagnostics(),
      };
    case "unavailable":
      return {
        enabled: false,
        diagnostics: null,
        reason: adoptionConstructionState.reason,
      };
    case "disabled":
      return { enabled: false, diagnostics: null, reason: "kill_switch" };
    case "not_attempted":
      return {
        enabled: false,
        diagnostics: null,
        reason: "no_worker_attached",
      };
    case "driver_error":
      return {
        enabled: false,
        diagnostics: null,
        reason: `driver_error: ${adoptionConstructionState.lastError}`,
      };
    case "construction_failed":
      return {
        enabled: false,
        diagnostics: null,
        reason: `construction_failed: ${adoptionConstructionState.lastError}`,
      };
  }
}

function recordAdoptionDriverError(err: unknown): void {
  adoptionConstructionState = {
    kind: "driver_error",
    lastError: describeError(err),
    since: Date.now(),
  };
  debugLog(`Orphan-queue adoption driver error: ${describeError(err)}`);
}

const exhaustedWorkerDirs = new Set<string>();

async function handleWorkerExhausted(
  projectStateDir: string,
  worker: InProcessWorker | undefined,
): Promise<void> {
  if (exhaustedWorkerDirs.has(projectStateDir)) return;
  exhaustedWorkerDirs.add(projectStateDir);

  recordWorkerRunFailure("<all>", new Error("worker exhausted"));
  if (worker) {
    inProcessTemporalWorkers.delete(worker);
    teardownWorkerAttachment(worker);
  }
}

/**
 * Register an in-process Temporal worker so registerShutdownHandlers can
 * drain it during plugin teardown. The worker lives inside this Node
 * process — shutdown is cooperative (`worker.shutdown()` signals drain,
 * `connection.close()` tears down the gRPC channel).
 */
export function registerInProcessTemporalWorker(worker: InProcessWorker): void {
  inProcessTemporalWorkers.add(worker);
}

/**
 * Register a worker and, if a Temporal client is available and orphan-queue
 * adoption is enabled, attach an `OrphanQueueAdopter`. This is the single
 * composition helper for worker-creation sites so both spawn and restart paths
 * can share ownership behavior (T2). T3 will route the restart path through
 * this helper. T4 populates `stopDriver` with the attachment tick driver.
 */
export function attachWorkerWithAdoption(
  worker: InProcessWorker,
  opts: { projectId: string; client: Client | null },
): void {
  registerInProcessTemporalWorker(worker);
  const attachment: WorkerAdoptionAttachment = {
    worker,
    adopter: null,
    stopDriver: null,
  };
  workerAdoptionAttachments.set(worker, attachment);
  if (!isOrphanQueueAdoptionEnabled()) {
    adoptionConstructionState = { kind: "disabled" };
    activeOrphanQueueAdopter = null;
    return;
  }
  if (!opts.client) {
    adoptionConstructionState = {
      kind: "unavailable",
      reason: "no_temporal_client",
    };
    activeOrphanQueueAdopter = null;
    return;
  }
  try {
    const adopter = new OrphanQueueAdopter({
      client: opts.client,
      projectId: opts.projectId,
      worker,
    });
    activeOrphanQueueAdopter = adopter;
    attachment.adopter = adopter;
    adoptionConstructionState = { kind: "active", adopter };

    // T4: drive the adopter from the attachment itself so both spawn and restart
    // paths adopt orphans even when there is no worker-lock heartbeat (AC3).
    // The closure captures this adopter, not the module-level variable that may
    // be replaced by a later attachment.
    const driverHandle = setInterval(() => {
      adopter.adoptNextOrphan().catch((e) => {
        recordAdoptionDriverError(e);
      });
    }, 10_000);
    attachment.stopDriver = () => clearInterval(driverHandle);
  } catch (e) {
    adoptionConstructionState = {
      kind: "construction_failed",
      lastError: describeError(e),
    };
    activeOrphanQueueAdopter = null;
    attachment.adopter = null;
    attachment.stopDriver = null;
  }
}

function registerWorkerLockHeartbeat(
  heartbeat: WorkerLockHeartbeatController,
): void {
  workerLockHeartbeats.add(heartbeat);
}

function isWorkerServiceable(worker: InProcessWorker, queue: string): boolean {
  const failedQueues = new Set(worker.failedQueues ?? []);
  return worker.queues.includes(queue) && !failedQueues.has(queue);
}

export function getRegisteredTemporalWorkerQueues(): string[] {
  const queues = new Set<string>();
  for (const worker of inProcessTemporalWorkers) {
    for (const queue of worker.queues) {
      queues.add(queue);
    }
  }
  return [...queues].sort((a, b) => a.localeCompare(b));
}

export function getTemporalWorkerRole(): WorkerRole {
  return currentWorkerRole;
}

export type TemporalWorkerDiagnostics =
  | {
      kind: "in_process";
      queues: string[];
      failedQueues: string[];
      alive: boolean;
    }
  | {
      kind: "out_of_process";
      queues: string[];
      failedQueues: string[];
      alive: boolean;
      diagnostics: unknown;
    };

export function getTemporalWorkerDiagnostics(): TemporalWorkerDiagnostics[] {
  return [...inProcessTemporalWorkers].map((worker) => {
    const failedQueues = [...(worker.failedQueues ?? [])];
    const failed = new Set(failedQueues);
    const candidate = worker as InProcessWorker & {
      isAlive?: () => boolean;
      getDiagnostics?: () => unknown;
    };
    if (typeof candidate.getDiagnostics === "function") {
      return {
        kind: "out_of_process",
        queues: [...worker.queues],
        failedQueues,
        alive:
          typeof candidate.isAlive === "function"
            ? candidate.isAlive()
            : worker.queues.some((queue) => !failed.has(queue)),
        diagnostics: candidate.getDiagnostics(),
      };
    }
    return {
      kind: "in_process",
      queues: [...worker.queues],
      failedQueues,
      alive: worker.queues.some((queue) => !failed.has(queue)),
    };
  });
}

export async function ensureProjectTemporalQueue(
  projectId: string,
): Promise<void> {
  const queue = buildProjectTaskQueue(projectId);
  if (getRegisteredTemporalWorkerQueues().includes(queue)) return;

  const workers = [...inProcessTemporalWorkers];
  if (workers.length === 0) {
    throw new Error(
      `Temporal worker not ready for target project queue ${queue}: no registered worker`,
    );
  }

  await Promise.all(workers.map((worker) => worker.registerQueue(queue)));
}

/**
 * Aggregate liveness probe for registered Temporal workers.
 *
 * - OOP worker: delegates to the worker's `isAlive()` which returns true iff
 *   at least one child process is still running (exitCode === null) and not
 *   marked dead by the restart policy.
 * - In-process worker: alive iff it has at least one registered queue. The
 *   SDK's own Worker class does not expose a direct liveness flag, so queue
 *   count is our best proxy; worker.shutdown() clears the queue list, which
 *   gives the same result.
 *
 * Returns `false` when no workers are registered (typical of file-backed
 * degraded mode).
 */
export function getTemporalWorkerAliveness(): boolean {
  if (inProcessTemporalWorkers.size === 0) return false;
  for (const worker of inProcessTemporalWorkers) {
    // OOP worker exposes isAlive(); in-process does not.
    const candidate = worker as InProcessWorker & { isAlive?: () => boolean };
    if (typeof candidate.isAlive === "function") {
      if (candidate.isAlive()) return true;
    } else {
      const failedQueues = new Set(worker.failedQueues ?? []);
      if (worker.queues.some((queue) => !failedQueues.has(queue))) {
        return true;
      }
    }
  }
  return false;
}

async function drainInProcessTemporalWorkers(): Promise<void> {
  const workers = [...inProcessTemporalWorkers];
  inProcessTemporalWorkers.clear();
  // C6: stop drivers BEFORE shutdown — a driver outliving its worker targets a
  // drained worker.
  for (const worker of workers) {
    teardownWorkerAttachment(worker);
  }
  await Promise.all(
    workers.map(async (worker) => {
      try {
        await worker.shutdown();
      } catch (e) {
        debugLog(`Error shutting down in-process Temporal worker: ${e}`);
      }
    }),
  );
}

async function drainWorkerLockHeartbeats(): Promise<void> {
  const heartbeats = [...workerLockHeartbeats];
  workerLockHeartbeats.clear();
  await Promise.all(
    heartbeats.map(async (heartbeat) => {
      try {
        await heartbeat.stop();
      } catch (e) {
        debugLog(`Error stopping worker lock heartbeat: ${e}`);
      }
    }),
  );
}

// =============================================================================
// Health monitor (P1.6)
// =============================================================================

let activeHealthMonitor: HealthMonitor | null = null;

/**
 * Composite worker health probe (P1.6 + P1.10):
 * 1. `describeNamespace` — connection liveness.
 * 2. `describeWorkflowExecution` against a sentinel ID — server↔worker
 *    round-trip. A `NotFound` rejection is the healthy outcome (server
 *    processed our request promptly). A hang means zombie worker; the
 *    monitor's outer `probeTimeoutMs` catches it and routes to restart.
 */
const probeWorkerHealth = composeWorkerHealthProbe({
  getBundle: () => getService(),
});

/**
 * Start the worker health monitor. Probes every 30s; on failure
 * triggers `restartCurrentProjectTemporalWorker`. Bounded to 10
 * restart attempts before emitting `[ADV:BLOCKED]`. See P1.6.
 */
export function startWorkerHealthMonitor(projectDir: string): HealthMonitor {
  if (activeHealthMonitor) return activeHealthMonitor;
  const monitor = createHealthMonitor({
    probe: probeWorkerHealth,
    restart: async () => {
      await restartCurrentProjectTemporalWorker(projectDir);
    },
    onBlocked: () => {
      logger.error(
        "[ADV:BLOCKED] Worker health restart budget exhausted — adv_* tools may stall. Run /adv-status to confirm; manual restart of OpenCode may be required.",
      );
    },
  });
  monitor.start();
  activeHealthMonitor = monitor;
  return monitor;
}

/**
 * Stop the active worker health monitor. Idempotent.
 * Called from `shutdownWithFlush` to avoid leaked timers across
 * sessions.
 */
export function stopWorkerHealthMonitor(): void {
  if (activeHealthMonitor) {
    activeHealthMonitor.stop();
    activeHealthMonitor = null;
  }
}

export interface RestartCurrentProjectTemporalWorkerOptions {
  approvedLockReclaim?: boolean;
  approvalEvidence?: string;
}

export interface RestartCurrentProjectTemporalWorkerResult {
  projectId: string;
  queues: string[];
  expectedQueue: string;
}

export async function restartCurrentProjectTemporalWorker(
  projectDir: string,
  options: RestartCurrentProjectTemporalWorkerOptions = {},
): Promise<RestartCurrentProjectTemporalWorkerResult> {
  const projectId = await getProjectId(projectDir);
  if (!projectId) {
    throw new Error(
      "Cannot restart Temporal worker: no projectId for current directory",
    );
  }
  const expectedQueue = buildProjectTaskQueue(projectId);
  // KD-2 / rq-isolSessionTaskQueue01: include session queue on restart too,
  // reading the current session ID from the utils holder. If restart happens
  // before plugin-init has set a session ID (recovery scenario), only the
  // project queue is polled — the next plugin-init will spawn with both.
  const restartSessionId = getCurrentSessionId();
  const restartSessionQueue = restartSessionId
    ? buildSessionTaskQueue(projectId, restartSessionId)
    : undefined;
  const restartWorkerQueues = restartSessionQueue
    ? [restartSessionQueue, expectedQueue]
    : [expectedQueue];

  if (options.approvedLockReclaim && !options.approvalEvidence?.trim()) {
    throw new Error(
      "Cannot restart Temporal worker with approved lock reclaim: approvalEvidence is required",
    );
  }

  await drainInProcessTemporalWorkers();
  const projectStateDir = getExternalRoot(projectId);
  const runtime = await ensureTemporalRuntime(projectId);

  const workerProbe = probeTemporalWorkerRuntime();
  const workerRef: { current?: InProcessWorker } = {};
  const onWorkerExhausted = async (): Promise<void> => {
    await handleWorkerExhausted(projectStateDir, workerRef.current);
  };

  const worker = workerProbe.supported
    ? await createInProcessWorker({
        address: runtime.address,
        namespace: runtime.namespace,
        queues: restartWorkerQueues,
        artifactPolicy: {
          mode: "production_verified",
          bundleDir: dirname(resolveWorkerScriptPath()),
        },
        onWorkerExhausted,
      })
    : await createOutOfProcessWorker({
        address: runtime.address,
        namespace: runtime.namespace,
        queues: restartWorkerQueues,
        workerScript: resolveWorkerScriptPath(),
        projectId,
        sessionId: restartSessionId,
        onWorkerExhausted,
      });
  workerRef.current = worker;
  attachWorkerWithAdoption(worker, {
    projectId,
    client: getService()?.client ?? null,
  });
  return {
    projectId,
    queues: [...worker.queues],
    expectedQueue,
  };
}

export interface ShutdownHandlers {
  handleExit: () => void;
  shutdownWithFlush: () => void;
  removeProcessListeners: () => void;
}

let shutdownHandlersRegistered = false;

const noopShutdownHandlers: ShutdownHandlers = {
  handleExit: () => {},
  shutdownWithFlush: () => {},
  removeProcessListeners: () => {},
};

/**
 * Remove this session's loaded-build registry record (AC9/DDC5). Sync and
 * best-effort so it is safe inside process.on("exit") handlers; dead-PID
 * records are also reaped lazily by the inventory collector, so a missed
 * removal never blocks cutover.
 */
function unregisterPluginSessionRecord(): void {
  try {
    unregisterLoadedBuildSession({ migrationRoot: resolveMigrationRoot() });
  } catch (e) {
    debugLog(`Error unregistering loaded-build session record: ${e}`);
  }
}

/**
 * Build process-level shutdown handlers that tolerate a null store (init
 * failure). Returns handlers plus a disposer that removes the installed
 * process listeners.
 *
 * The caller is responsible for invoking removeProcessListeners() on
 * session.deleted to prevent listener leaks across sessions.
 */
export function registerShutdownHandlers(
  store: Store | null,
): ShutdownHandlers {
  if (shutdownHandlersRegistered) {
    debugLog(
      "registerShutdownHandlers: already registered, returning no-op handlers",
    );
    return noopShutdownHandlers;
  }
  shutdownHandlersRegistered = true;

  const handleExit = () => {
    cleanupTerminal();
    unregisterPluginSessionRecord();
    // Fire-and-forget: process.on("exit") handlers MUST be synchronous.
    // The in-process worker's shutdown is best-effort at this stage; real
    // graceful drain happens via shutdownWithFlush on SIGINT/SIGTERM.
    stopWorkerHealthMonitor();
    void drainWorkerLockHeartbeats();
    void drainInProcessTemporalWorkers();
    if (!store) return;
    try {
      store.close();
    } catch (e) {
      debugLog(`Error closing store on exit: ${e}`);
    }
  };

  // rq-advshut1: Bounded Signal Flush on Shutdown — store.flush
  // attempted before store.close, hard timeout bounds duration, and
  // duplicate SIGINT/SIGTERM signals are made idempotent via flushInFlight.
  let flushInFlight = false;
  const shutdownWithFlush = () => {
    cleanupTerminal();
    unregisterPluginSessionRecord();
    stopWorkerHealthMonitor();
    if (flushInFlight) return;
    flushInFlight = true;
    if (!store) {
      process.exit(0);
      return;
    }
    const activeStore = store;
    const safeClose = (phase: string) => {
      try {
        activeStore.close();
      } catch (e) {
        debugLog(`Error closing store (${phase}): ${e}`);
      }
    };
    // Maximum wait for in-flight Temporal operations to complete during
    // process shutdown. After this timeout, force-exit to prevent hangs.
    // 3s is sufficient for typical Temporal signal/query completions while
    // keeping shutdown responsive for interactive use.
    const SHUTDOWN_FLUSH_TIMEOUT_MS = 3_000;
    const flushTimeout = setTimeout(() => {
      safeClose("timeout");
      process.exit(0);
    }, SHUTDOWN_FLUSH_TIMEOUT_MS);
    void (async () => {
      try {
        await activeStore.flush();
        await drainWorkerLockHeartbeats();
        await drainInProcessTemporalWorkers();
        await closeStsl();
      } catch (e) {
        debugLog(`Error during shutdownWithFlush: ${e}`);
      } finally {
        clearTimeout(flushTimeout);
        safeClose("flush");
        process.exit(0);
      }
    })();
  };

  process.on("exit", handleExit);
  process.on("SIGINT", shutdownWithFlush);
  process.on("SIGTERM", shutdownWithFlush);

  const removeProcessListeners = () => {
    process.removeListener("exit", handleExit);
    process.removeListener("SIGINT", shutdownWithFlush);
    process.removeListener("SIGTERM", shutdownWithFlush);
    shutdownHandlersRegistered = false;
  };

  return { handleExit, shutdownWithFlush, removeProcessListeners };
}
