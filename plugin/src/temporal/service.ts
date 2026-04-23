/**
 * Shared Temporal Service Layer (STSL)
 *
 * Singleton Client+Connection lifecycle for ADV's Temporal integration.
 * Replaces per-call `createTemporalClientBundle` with a session-scoped
 * shared connection that all consumers use via `getService()`.
 *
 * Lifecycle:
 *   1. `initStsl(env)` — create + cache the bundle (idempotent for same env)
 *   2. `getService()` — read the cached bundle (null before init)
 *   3. `closeStsl()` — close the connection + clear the cache
 *
 * Thread safety: single-process, single-threaded (Bun/Node). No mutex needed.
 */

import { Client, Connection } from "@temporalio/client";
import { getTemporalAddress, getTemporalNamespace } from "./client";
import { appendDebugLog } from "../utils/debug-log";

const debugLog = (msg: string): void => appendDebugLog("stsl", msg);

interface StslBundle {
  address: string;
  namespace: string;
  connection: Connection;
  client: Client;
}

let cachedBundle: StslBundle | null = null;

/**
 * Initialize the shared Temporal service layer. Idempotent when called with
 * the same address/namespace — returns the existing bundle without creating
 * a new connection. Throws if already initialized with different parameters
 * (prevents accidental env drift).
 */
export async function initStsl(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StslBundle> {
  const address = getTemporalAddress(env);
  const namespace = getTemporalNamespace(env);

  if (cachedBundle) {
    if (cachedBundle.address === address && cachedBundle.namespace === namespace) {
      debugLog(`initStsl: returning existing bundle (${address}/${namespace})`);
      return cachedBundle;
    }
    throw new Error(
      `STSL already initialized with different parameters ` +
        `(existing: ${cachedBundle.address}/${cachedBundle.namespace}, ` +
        `requested: ${address}/${namespace}). Call closeStsl() first.`,
    );
  }

  debugLog(`initStsl: creating new bundle (${address}/${namespace})`);
  const connection = await Connection.connect({ address });
  const client = new Client({ connection, namespace });

  cachedBundle = { address, namespace, connection, client };
  debugLog(`initStsl: bundle ready`);
  return cachedBundle;
}

/**
 * Get the cached STSL bundle. Returns null before initialization.
 */
export function getService(): StslBundle | null {
  return cachedBundle;
}

/**
 * Check whether the STSL has been initialized.
 */
export function isStslInitialized(): boolean {
  return cachedBundle !== null;
}

/**
 * Close the shared Temporal connection and clear the cached bundle.
 * Idempotent — safe to call multiple times or when not initialized.
 */
export async function closeStsl(): Promise<void> {
  if (!cachedBundle) {
    debugLog(`closeStsl: no bundle to close`);
    return;
  }

  debugLog(`closeStsl: closing connection`);
  try {
    await cachedBundle.connection.close();
  } catch (e) {
    debugLog(`closeStsl: connection.close error: ${e}`);
  }
  cachedBundle = null;
  debugLog(`closeStsl: complete`);
}

/**
 * Reset the STSL state. For testing only — does NOT close the connection.
 */
export function resetStsl(): void {
  cachedBundle = null;
}
