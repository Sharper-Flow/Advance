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

import { performance } from "node:perf_hooks";

import { createStore } from "./storage/store";
import type { Store } from "./storage/store-types";
import { cleanup as cleanupTerminal } from "./events";
import {
  appendDebugLog,
  appendProfileLog,
  createLogger,
} from "./utils/debug-log";
import { getExternalRoot } from "./utils/project-id";
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
import { resolveProductContext } from "./storage/product-context";

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

export async function tryInitStore(
  effectiveDir: string,
  _externalRoot: string | undefined,
): Promise<StoreInitResult> {
  const initStartedAt = performance.now();

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

    profilePluginInit("backend_mode_detected", {
      backend_mode: "disk",
    });

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

    const storeCreateStartedAt = performance.now();
    const store = await createStore(effectiveDir, {
      externalRoot: productExternalRoot,
      productContext,
    });
    profilePluginInit("store_created", {
      duration_ms: Number(
        (performance.now() - storeCreateStartedAt).toFixed(3),
      ),
      backend_mode: "disk",
    });

    const storeInitStartedAt = performance.now();
    await store.init();
    profilePluginInit("store_initialized", {
      duration_ms: Number((performance.now() - storeInitStartedAt).toFixed(3)),
    });

    profilePluginInit("try_init_store_complete", {
      duration_ms: Number((performance.now() - initStartedAt).toFixed(3)),
      backend_mode: "disk",
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

    logger.info(
      `Plugin init failed: ${initError.message} — adv_* tools are stubbed and will report ADV_PLUGIN_INIT_FAILED until the cause is fixed.`,
    );

    return { store: null, initError };
  }
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
    if (!store) return;
    try {
      store.close();
    } catch (e) {
      debugLog(`Error closing store on exit: ${e}`);
    }
  };

  // rq-advshut1: bounded Signal Flush on Shutdown — store.flush is attempted
  // before store.close, with a hard timeout and idempotent signal handling.
  let flushInFlight = false;
  const shutdownWithFlush = () => {
    cleanupTerminal();
    unregisterPluginSessionRecord();
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
    const SHUTDOWN_FLUSH_TIMEOUT_MS = 3_000;
    const flushTimeout = setTimeout(() => {
      safeClose("timeout");
      process.exit(0);
    }, SHUTDOWN_FLUSH_TIMEOUT_MS);
    void (async () => {
      try {
        await activeStore.flush();
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
