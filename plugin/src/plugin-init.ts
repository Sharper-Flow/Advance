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

import { createStore } from "./storage/store";
import type { Store } from "./storage/store-types";
import { loadProjectConfig } from "./storage/json";
import { buildProjectTaskQueue } from "./temporal/client";
import { initStsl, closeStsl, getService } from "./temporal/service";
import {
  createInProcessWorker,
  type InProcessWorker,
} from "./temporal/in-process-worker";
import { createOutOfProcessWorker } from "./temporal/out-of-process-worker";
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
import { performance } from "node:perf_hooks";
import { cleanup as cleanupTerminal } from "./events";
import {
  appendDebugLog,
  appendProfileLog,
  createLogger,
} from "./utils/debug-log";
import { getExternalRoot, getProjectId } from "./utils/project-id";
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

const debugLog = (msg: string): void => appendDebugLog("plugin-init", msg);
const logger = createLogger("plugin-init");

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

export interface WorkerSingletonPlanOptions
  extends Omit<ReclaimWorkerLockOptions, "schemaVersion" | "expectedQueue"> {
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

    let temporalBundle: Awaited<ReturnType<typeof initStsl>> | undefined;
    profilePluginInit("backend_mode_detected", {
      backend_mode: "temporal",
    });
    if (projectId) {
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
              spawnedWorker ? isWorkerServiceable(spawnedWorker, expectedQueue) : true,
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
            queues: [expectedQueue],
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
          spawnedWorker = await createOutOfProcessWorker({
            address: runtime.address,
            namespace: runtime.namespace,
            queues: [expectedQueue],
            workerScript: resolveWorkerScriptPath(),
            projectId,
            onWorkerExhausted,
          });
          worker = spawnedWorker;
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
        registerInProcessTemporalWorker(worker);
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

const exhaustedWorkerDirs = new Set<string>();

async function handleWorkerExhausted(
  projectStateDir: string,
  worker: InProcessWorker | undefined,
): Promise<void> {
  if (exhaustedWorkerDirs.has(projectStateDir)) return;
  exhaustedWorkerDirs.add(projectStateDir);

  recordWorkerRunFailure("<all>", new Error("worker exhausted"));
  if (worker) inProcessTemporalWorkers.delete(worker);
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
        queues: [expectedQueue],
        onWorkerExhausted,
      })
    : await createOutOfProcessWorker({
        address: runtime.address,
        namespace: runtime.namespace,
        queues: [expectedQueue],
        workerScript: resolveWorkerScriptPath(),
        projectId,
        onWorkerExhausted,
      });
  workerRef.current = worker;
  registerInProcessTemporalWorker(worker);
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
  const handleExit = () => {
    cleanupTerminal();
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
  };

  return { handleExit, shutdownWithFlush, removeProcessListeners };
}
