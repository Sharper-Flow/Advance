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
import { cleanup as cleanupTerminal } from "./events";
import { appendDebugLog } from "./utils/debug-log";

const debugLog = (msg: string): void => appendDebugLog("plugin-init", msg);

export interface StoreInitResult {
  store: Store | null;
  initError: Error | null;
}

/**
 * Attempt to create and initialize the ADV store. Never throws — any failure
 * is captured in the returned initError and logged.
 */
export async function tryInitStore(
  effectiveDir: string,
  externalRoot: string | undefined,
): Promise<StoreInitResult> {
  try {
    const store = await createStore(effectiveDir, { externalRoot });
    await store.init();
    return { store, initError: null };
  } catch (e) {
    const initError = e instanceof Error ? e : new Error(String(e));
    debugLog(`Plugin init FAILED: ${initError.message}`);
    console.warn(
      `[ADV] Plugin init failed: ${initError.message}\n` +
        `[ADV] adv_* tools are stubbed — they will report ADV_PLUGIN_INIT_FAILED until the cause is fixed.`,
    );
    return { store: null, initError };
  }
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
    activeStore.flush().finally(() => {
      clearTimeout(flushTimeout);
      safeClose("flush");
      process.exit(0);
    });
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
