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
import { ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES } from "./observability";
import { appendDebugLog, createLogger } from "../utils/debug-log";

const debugLog = (msg: string): void => appendDebugLog("stsl", msg);
const logger = createLogger("stsl");

/**
 * Register the ADV custom search attributes with the Temporal server.
 * Idempotent: already-registered attributes produce `AlreadyExists` which
 * is treated as success. Any other failure is logged and swallowed — a
 * missing search-attribute registry on a self-hosted Temporal isn't
 * fatal to plugin init (workflows without search attrs still run), but
 * the downstream Visibility API queries will fail until operators run
 * `temporal operator search-attribute create` manually.
 *
 * The attribute types are intentional:
 *   - AdvProjectId, AdvChangeId, AdvChangeStatus, AdvActiveGate: Keyword
 *     (exact-match + low-cardinality, supports `=` / `IN` filters).
 *   - AdvDoomLoopActive: Bool (flag).
 */
async function registerAdvSearchAttributes(
  connection: Connection,
  namespace: string,
): Promise<void> {
  const svc = (
    connection as unknown as {
      operatorService?: {
        addSearchAttributes?: (req: {
          namespace: string;
          searchAttributes: Record<string, number>;
        }) => Promise<unknown>;
      };
    }
  ).operatorService;
  if (!svc || typeof svc.addSearchAttributes !== "function") {
    logger.debug(
      "OperatorService.addSearchAttributes unavailable — skipping search-attribute registration",
    );
    return;
  }
  // IndexedValueType enum — hard-coded numeric codes from the Temporal
  // API proto so we don't need a proto import just for this: Keyword=1,
  // Bool=4. Matches server-side validation.
  const KEYWORD = 1;
  const BOOL = 4;
  const searchAttributes: Record<string, number> = {
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.projectId]: KEYWORD,
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeId]: KEYWORD,
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.changeStatus]: KEYWORD,
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.activeGate]: KEYWORD,
    [ADVANCE_TEMPORAL_SEARCH_ATTRIBUTES.doomLoop]: BOOL,
  };
  try {
    await svc.addSearchAttributes({ namespace, searchAttributes });
    logger.debug("Registered ADV search attributes");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/already\s*exists|ALREADY_EXISTS/i.test(msg)) {
      logger.debug(
        `ADV search attributes already registered (idempotent no-op): ${msg}`,
      );
      return;
    }
    logger.warn(
      `Failed to register ADV search attributes (Visibility queries may fail): ${msg}`,
    );
  }
}

interface StslBundle {
  address: string;
  namespace: string;
  connection: Connection;
  client: Client;
}

let cachedBundle: StslBundle | null = null;
let getServiceCallCount = 0;
let newConnectionCount = 0;
let reconnectCount = 0;
let reconnectFailureCount = 0;
let inFlightReconnect: Promise<void> | null = null;

export interface StslStats {
  getServiceCalls: number;
  newConnections: number;
  reuseRate: number;
  /**
   * Number of times reinitStsl successfully replaced the cached
   * connection+client. Increments only when close (best-effort) +
   * Connection.connect + new Client all succeed.
   */
  reconnectCount: number;
  /**
   * Number of times reinitStsl threw because Connection.connect rejected.
   * close() failures are swallowed and do NOT count.
   */
  reconnectFailureCount: number;
}

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
    if (
      cachedBundle.address === address &&
      cachedBundle.namespace === namespace
    ) {
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
  newConnectionCount++;

  // Register ADV custom search attributes with the server so Visibility
  // API queries and workflow.start() search-attribute payloads work.
  // Idempotent; failure is non-fatal (warned, not thrown).
  await registerAdvSearchAttributes(connection, namespace);

  cachedBundle = { address, namespace, connection, client };
  debugLog(`initStsl: bundle ready`);
  return cachedBundle;
}

/**
 * Get the cached STSL bundle. Returns null before initialization.
 */
export function getService(): StslBundle | null {
  getServiceCallCount++;
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
  getServiceCallCount = 0;
  newConnectionCount = 0;
  reconnectCount = 0;
  reconnectFailureCount = 0;
  inFlightReconnect = null;
}

export function getStslStats(): StslStats {
  return {
    getServiceCalls: getServiceCallCount,
    newConnections: newConnectionCount,
    reuseRate:
      newConnectionCount > 0 ? getServiceCallCount / newConnectionCount : 0,
    reconnectCount,
    reconnectFailureCount,
  };
}

/**
 * Replace the cached Temporal connection + client in-place after a
 * stale-connection failure (server restart, gRPC GOAWAY, broken pipe).
 *
 * Behavior (KD-1, KD-3, KD-5):
 *   - Mutates `cachedBundle.connection` and `cachedBundle.client` in place;
 *     the bundle object identity is preserved so existing closures (e.g.
 *     `createTemporalStoreBackend`'s captured `input.temporal`) pick up
 *     the new client/connection on the next per-call read.
 *   - Single-flight: concurrent callers await the same in-flight promise.
 *     JS event-loop semantics make TOCTOU impossible — the IIFE assignment
 *     below is synchronous, so a second caller arriving before the first
 *     `await` yields will observe a non-null `inFlightReconnect`.
 *   - Best-effort close: a rejecting `connection.close()` is logged and
 *     ignored; reinit proceeds to `Connection.connect`.
 *   - Re-registers ADV search attributes (idempotent on `AlreadyExists`).
 *   - On `Connection.connect` failure, increments `reconnectFailureCount`,
 *     clears the in-flight guard, and rethrows so the caller (typically
 *     a per-op `onTransientFailure` hook in `runTemporal`/
 *     `runTemporalQuery`) can record + suppress.
 *
 * Throws if STSL is not initialized — production callers always come
 * through the store backend after `initStsl` ran in `plugin-init.ts`.
 */
export async function reinitStsl(): Promise<void> {
  if (inFlightReconnect) {
    return inFlightReconnect;
  }
  if (!cachedBundle) {
    throw new Error("reinitStsl: STSL not initialized — call initStsl first");
  }

  const bundle = cachedBundle;
  const promise = (async () => {
    try {
      try {
        await bundle.connection.close();
      } catch (e) {
        debugLog(`reinitStsl: close error (continuing): ${e}`);
      }
      const newConnection = await Connection.connect({ address: bundle.address });
      const newClient = new Client({
        connection: newConnection,
        namespace: bundle.namespace,
      });
      bundle.connection = newConnection;
      bundle.client = newClient;
      newConnectionCount++;
      await registerAdvSearchAttributes(newConnection, bundle.namespace);
      reconnectCount++;
      debugLog(`reinitStsl: success (${bundle.address}/${bundle.namespace})`);
    } catch (err) {
      reconnectFailureCount++;
      debugLog(`reinitStsl: failed: ${err}`);
      throw err;
    }
  })();

  inFlightReconnect = promise.finally(() => {
    inFlightReconnect = null;
  });
  return inFlightReconnect;
}
