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
import {
  buildProjectTaskQueue,
  createTemporalClientBundle,
} from "./temporal/client";
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
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { cleanup as cleanupTerminal } from "./events";
import {
  appendDebugLog,
  appendProfileLog,
  createLogger,
} from "./utils/debug-log";
import { getProjectId } from "./utils/project-id";

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

/**
 * Attempt to create and initialize the ADV store. Never throws — any failure
 * is captured in the returned initError and logged.
 */
async function initStoreWithoutTemporal(
  effectiveDir: string,
  externalRoot: string | undefined,
  projectId: string | null,
): Promise<StoreInitResult> {
  const startedAt = performance.now();
  const store = await createStore(effectiveDir, {
    externalRoot,
    projectIdOverride: projectId ?? undefined,
    // No temporalBundle — file-backed harness path.
  });
  await store.init();
  profilePluginInit("legacy_fallback_ready", {
    duration_ms: Number((performance.now() - startedAt).toFixed(3)),
    backend_mode: "legacy",
  });
  return { store, initError: null };
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
  externalRoot: string | undefined,
): Promise<StoreInitResult> {
  const initStartedAt = performance.now();
  const projectIdStartedAt = performance.now();
  const projectId = await getProjectId(effectiveDir);
  profilePluginInit("project_id_resolved", {
    duration_ms: Number((performance.now() - projectIdStartedAt).toFixed(3)),
    hasProjectId: Boolean(projectId),
  });
  let worker: InProcessWorker | undefined;

  try {
    let temporalBundle:
      | Awaited<ReturnType<typeof createTemporalClientBundle>>
      | undefined;
    const temporalDisabled = process.env.ADV_DISABLE_TEMPORAL === "1";
    profilePluginInit("backend_mode_detected", {
      temporal_disabled: temporalDisabled,
      backend_mode: temporalDisabled ? "legacy" : "temporal_candidate",
    });
    if (projectId && !temporalDisabled) {
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

      if (workerProbe.supported) {
        const workerStartedAt = performance.now();
        // Node host — worker runs in-process (existing behavior).
        worker = await createInProcessWorker({
          address: runtime.address,
          namespace: runtime.namespace,
          queues: [buildProjectTaskQueue(projectId)],
        });
        profilePluginInit("worker_started", {
          duration_ms: Number((performance.now() - workerStartedAt).toFixed(3)),
          worker_model: "in_process",
        });
      } else {
        // Bun (or other unsupported worker host) — spawn a Node child.
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
        worker = await createOutOfProcessWorker({
          address: runtime.address,
          namespace: runtime.namespace,
          queues: [buildProjectTaskQueue(projectId)],
          workerScript: resolveWorkerScriptPath(),
          projectId,
        });
        profilePluginInit("worker_started", {
          duration_ms: Number((performance.now() - workerStartedAt).toFixed(3)),
          worker_model: "out_of_process",
        });
      }

      const bundleStartedAt = performance.now();
      temporalBundle = await createTemporalClientBundle(
        buildTemporalClientEnv({
          address: runtime.address,
          namespace: runtime.namespace,
        }),
      );
      profilePluginInit("temporal_client_ready", {
        duration_ms: Number((performance.now() - bundleStartedAt).toFixed(3)),
      });
      registerInProcessTemporalWorker(worker);
    }

    const storeCreateStartedAt = performance.now();
    const store = await createStore(effectiveDir, {
      externalRoot,
      projectIdOverride: projectId ?? undefined,
      temporalBundle,
    });
    profilePluginInit("store_created", {
      duration_ms: Number(
        (performance.now() - storeCreateStartedAt).toFixed(3),
      ),
      backend_mode: temporalBundle ? "temporal" : "legacy",
    });

    const storeInitStartedAt = performance.now();
    await store.init();
    profilePluginInit("store_initialized", {
      duration_ms: Number((performance.now() - storeInitStartedAt).toFixed(3)),
    });
    profilePluginInit("try_init_store_complete", {
      duration_ms: Number((performance.now() - initStartedAt).toFixed(3)),
      backend_mode: temporalBundle ? "temporal" : "legacy",
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
      degraded_fallback: process.env.ADV_ALLOW_DEGRADED_FALLBACK === "1",
    });

    // If a worker was already created before createStore()/store.init() or the
    // client-bundle step failed, drain it now so we don't leave a polling
    // worker (or OOP child) running behind a failed plugin init.
    if (worker) {
      try {
        await worker.shutdown();
      } catch (shutdownError) {
        debugLog(
          `Error shutting down worker after init failure: ${shutdownError instanceof Error ? shutdownError.message : String(shutdownError)}`,
        );
      }
    }

    // Narrow scope per validator (fixTemporalWorkerBundleFailure design):
    // init failure is captured in initError + downstream ADV_PLUGIN_INIT_FAILED
    // tool stubs. Log at info level (file sink only, no console) to avoid
    // spamming every opencode session on Bun where Worker.create fails. Other
    // logger.warn/logger.error call sites (sqlite, storage, etc.) keep their
    // console output so real operational issues remain visible.
    logger.info(
      `Plugin init failed: ${initError.message} — adv_* tools are stubbed and will report ADV_PLUGIN_INIT_FAILED until the cause is fixed.`,
    );

    // Opt-in graceful degradation: if the user has set
    // ADV_ALLOW_DEGRADED_FALLBACK=1 they prefer a working file-backed store
    // over the degraded-tool-map stubs. Deprecated-by-design: removed once
    // out-of-process Node worker ships (Phase 2).
    if (process.env.ADV_ALLOW_DEGRADED_FALLBACK === "1") {
      try {
        debugLog(
          `ADV_ALLOW_DEGRADED_FALLBACK=1 — falling back to file-backed store`,
        );
        profilePluginInit("degraded_fallback_started", {
          backend_mode: "legacy",
        });
        const fallbackResult = await initStoreWithoutTemporal(
          effectiveDir,
          externalRoot,
          projectId,
        );
        profilePluginInit("try_init_store_complete", {
          duration_ms: Number((performance.now() - initStartedAt).toFixed(3)),
          backend_mode: "legacy",
          outcome: "success",
          degraded_fallback: true,
        });
        return fallbackResult;
      } catch (fallbackError) {
        const fbError =
          fallbackError instanceof Error
            ? fallbackError
            : new Error(String(fallbackError));
        debugLog(
          `Fallback to file-backed store also failed: ${fbError.message}`,
        );
        return { store: null, initError: fbError };
      }
    }

    return { store: null, initError };
  }
}

const inProcessTemporalWorkers = new Set<InProcessWorker>();

/**
 * Register an in-process Temporal worker so registerShutdownHandlers can
 * drain it during plugin teardown. The worker lives inside this Node
 * process — shutdown is cooperative (`worker.shutdown()` signals drain,
 * `connection.close()` tears down the gRPC channel).
 */
export function registerInProcessTemporalWorker(worker: InProcessWorker): void {
  inProcessTemporalWorkers.add(worker);
}

export function getRegisteredTemporalWorkerQueues(): string[] {
  const queues = new Set<string>();
  for (const worker of inProcessTemporalWorkers) {
    for (const queue of worker.queues) {
      queues.add(queue);
    }
  }
  return [...queues].sort();
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
    } else if (worker.queues.length > 0) {
      return true;
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

export async function restartCurrentProjectTemporalWorker(
  projectDir: string,
): Promise<{ projectId: string; queues: string[] }> {
  const projectId = await getProjectId(projectDir);
  if (!projectId) {
    throw new Error(
      "Cannot restart Temporal worker: no projectId for current directory",
    );
  }

  await drainInProcessTemporalWorkers();
  const runtime = await ensureTemporalRuntime(projectId);
  const workerProbe = probeTemporalWorkerRuntime();
  const worker = workerProbe.supported
    ? await createInProcessWorker({
        address: runtime.address,
        namespace: runtime.namespace,
        queues: [buildProjectTaskQueue(projectId)],
      })
    : await createOutOfProcessWorker({
        address: runtime.address,
        namespace: runtime.namespace,
        queues: [buildProjectTaskQueue(projectId)],
        workerScript: resolveWorkerScriptPath(),
        projectId,
      });
  registerInProcessTemporalWorker(worker);
  return { projectId, queues: [...worker.queues] };
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
    void drainInProcessTemporalWorkers();
    if (!store) return;
    try {
      store.close();
    } catch (e) {
      debugLog(`Error closing store on exit: ${e}`);
    }
  };

  let flushInFlight = false;
  const shutdownWithFlush = () => {
    cleanupTerminal();
    if (flushInFlight) return;
    flushInFlight = true;
    if (!store) return void process.exit(0);
    const activeStore = store;
    const safeClose = (phase: string) => {
      try {
        activeStore.close();
      } catch (e) {
        debugLog(`Error closing store (${phase}): ${e}`);
      }
    };
    const flushTimeout = setTimeout(() => {
      safeClose("timeout");
      process.exit(0);
    }, 3000);
    void (async () => {
      try {
        await activeStore.flush();
        await drainInProcessTemporalWorkers();
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
