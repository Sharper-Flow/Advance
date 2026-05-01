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
import {
  checkAdvSearchAttributes,
  registerMissingAdvSearchAttributes,
} from "./observability";
import type { AdvSearchAttributeCheckResult } from "./observability";
import { appendDebugLog, createLogger } from "../utils/debug-log";
import { getTemporalOpTelemetry } from "./retry-wrapper";

function formatErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

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
 * Delegates to `registerMissingAdvSearchAttributes` in `./observability`
 * so the attribute definitions live in a single place.
 */
async function registerAdvSearchAttributes(
  connection: Connection,
  namespace: string,
): Promise<void> {
  const result = await registerMissingAdvSearchAttributes(
    connection,
    namespace,
  );
  if (result.created.length > 0) {
    logger.debug(
      `Registered ADV search attributes: ${result.created.map((a) => a.name).join(", ")}`,
    );
  }
  if (result.skipped.length > 0) {
    logger.debug(
      `ADV search attributes already registered: ${result.skipped.map((a) => a.name).join(", ")}`,
    );
  }
  if (result.refused.length > 0) {
    logger.warn(
      `ADV search attributes refused (wrong type): ${result.refused
        .map((a) => `${a.name} (expected ${a.expected}, got ${a.actualCode})`)
        .join(", ")}`,
    );
  }
  if (result.error) {
    const isAlreadyExists = /already\s*exists|ALREADY_EXISTS/i.test(
      result.error,
    );
    if (isAlreadyExists) {
      logger.debug(
        `ADV search attributes already registered (idempotent no-op): ${result.error}`,
      );
    } else if (result.method === "unavailable") {
      logger.debug(
        `OperatorService.addSearchAttributes unavailable — skipping search-attribute registration: ${result.error}`,
      );
    } else {
      // Real registration failure (not AlreadyExists, not operator-API
      // unavailable). Elevated from warn to error so agents/operators see
      // it without scraping debug logs. Idempotent per session — runs once
      // per initStsl call. See change fixTemporalSearchAttrTypeCodes (AC-5).
      logger.error(
        `Failed to register ADV search attributes (Visibility queries may fail): ${result.error}`,
      );
    }
  }
}

/**
 * Verify that ADV search attributes are queryable by polling
 * `checkAdvSearchAttributes` after registration. Covers Temporal's
 * documented propagation delay (up to 10s on SQLite backends).
 *
 * Non-throwing: returns the final check result regardless of outcome.
 * Logs each poll at debug level; warns on timeout.
 */
export async function verifyAdvSearchAttributes(
  connection: Connection,
  namespace: string,
  maxAttempts = 20,
  delayMs = 500,
): Promise<AdvSearchAttributeCheckResult> {
  let lastResult: AdvSearchAttributeCheckResult;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = await checkAdvSearchAttributes(connection, namespace);
    if (lastResult.ok) {
      debugLog(
        `verifyAdvSearchAttributes: ok after ${attempt + 1}/${maxAttempts} attempts`,
      );
      return lastResult;
    }
    if (attempt < maxAttempts - 1) {
      debugLog(
        `verifyAdvSearchAttributes: attempt ${attempt + 1}/${maxAttempts} — ${lastResult.missing.length} missing, retrying in ${delayMs}ms`,
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Final check after all attempts exhausted
  lastResult = await checkAdvSearchAttributes(connection, namespace);
  if (!lastResult.ok) {
    logger.warn(
      `verifyAdvSearchAttributes: still not ok after ${maxAttempts} attempts — ${lastResult.missing.length} missing, ${lastResult.wrongType.length} wrong type`,
    );
  }
  return lastResult;
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
let lastSaVerification: { ok: boolean; checkedAt: number } | null = null;

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
  /** Per-operation telemetry from retry-wrapper (KD-3). */
  opTelemetry: import("./retry-wrapper").OpTelemetry[];
  /** Last SA verification result. Null before first verification. */
  saVerification: { ok: boolean; checkedAt: number } | null;
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

  // Verify SAs propagated (covers Temporal's documented propagation delay).
  const verification = await verifyAdvSearchAttributes(connection, namespace);
  lastSaVerification = { ok: verification.ok, checkedAt: Date.now() };

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
    debugLog(`closeStsl: connection.close error: ${formatErrorMessage(e)}`);
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
  lastSaVerification = null;
}

export function getStslStats(): StslStats {
  return {
    getServiceCalls: getServiceCallCount,
    newConnections: newConnectionCount,
    reuseRate:
      newConnectionCount > 0 ? getServiceCallCount / newConnectionCount : 0,
    reconnectCount,
    reconnectFailureCount,
    opTelemetry: getTemporalOpTelemetry(),
    saVerification: lastSaVerification,
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
        debugLog(
          `reinitStsl: close error (continuing): ${formatErrorMessage(e)}`,
        );
      }
      const newConnection = await Connection.connect({
        address: bundle.address,
      });
      const newClient = new Client({
        connection: newConnection,
        namespace: bundle.namespace,
      });
      bundle.connection = newConnection;
      bundle.client = newClient;
      newConnectionCount++;
      await registerAdvSearchAttributes(newConnection, bundle.namespace);
      const verification = await verifyAdvSearchAttributes(
        newConnection,
        bundle.namespace,
      );
      lastSaVerification = { ok: verification.ok, checkedAt: Date.now() };
      reconnectCount++;
      debugLog(`reinitStsl: success (${bundle.address}/${bundle.namespace})`);
    } catch (err) {
      reconnectFailureCount++;
      debugLog(`reinitStsl: failed: ${formatErrorMessage(err)}`);
      throw err;
    }
  })();

  inFlightReconnect = promise.finally(() => {
    inFlightReconnect = null;
  });
  return inFlightReconnect;
}
