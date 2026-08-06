/**
 * Shared Temporal Service Layer (STSL)
 *
 * Singleton TemporalOperationsOwner lifecycle for ADV's Temporal integration.
 * Replaces per-call raw client access with the closed operation-owner API.
 *
 * Lifecycle:
 *   1. `initStsl(env)` — return a disabled compatibility bundle
 *   2. `getService()` — read the cached owner (null before init)
 *   3. `closeStsl()` — close the owner connection + clear the cache
 *
 * Thread safety: single-process, single-threaded (Bun/Node). No mutex needed.
 */

import {
  TemporalOperationsOwner,
  type TemporalOperations,
  makeTemporalLifecycleContext,
} from "./operations";
import {
  checkAdvSearchAttributes,
  type AdvSearchAttributeCheckResult,
  type SearchAttributeConnectionLike,
} from "./observability";
import { createLogger } from "../utils/debug-log";
import { getTemporalOpTelemetry } from "./retry-wrapper";

const logger = createLogger("stsl");

let cachedOwner: TemporalOperationsOwner | null = null;
let getServiceCallCount = 0;
let newConnectionCount = 0;
let reconnectCount = 0;
let reconnectFailureCount = 0;
let inFlightReconnect: Promise<void> | null = null;
let lastSaVerification: { ok: boolean; checkedAt: number } | null = null;

export interface StslStats {
  getServiceCalls: number;
  newConnections: number;
  /**
   * Ratio of getService calls to new connections created. Reused bundles
   * make this number high; each connection serves many callers.
   */
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
 * the same address/namespace — returns the existing owner without creating
 * a new connection. Throws if already initialized with different parameters
 * (prevents accidental env drift).
 *
 * The caller must supply the actual typed project identity; the namespace is
 * used only for the Temporal gRPC namespace, never as the ADV project id.
 */
export async function initStsl(
  projectId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TemporalOperationsOwner> {
  void projectId;
  void env;
  // Temporal is intentionally disabled. Keep the return type and truthy
  // compatibility bundle for the existing store composition root, but never
  // cache an owner: all runtime reads use disk projections instead.
  cachedOwner = null;
  logger.debug("initStsl: Temporal disabled; using disk projections");
  return {} as TemporalOperationsOwner;
}

/**
 * Get the cached Temporal operation owner. Returns null before initialization.
 */
export function getService(): TemporalOperationsOwner | null {
  getServiceCallCount++;
  return cachedOwner;
}

export type { TemporalOperations };

/**
 * Check whether the STSL has been initialized.
 */
export function isStslInitialized(): boolean {
  return cachedOwner !== null;
}

/**
 * Close the shared Temporal connection and clear the cached owner.
 * Idempotent — safe to call multiple times or when not initialized.
 */
export async function closeStsl(): Promise<void> {
  if (!cachedOwner) {
    logger.debug(`closeStsl: no owner to close`);
    return;
  }

  logger.debug(`closeStsl: closing owner connection`);
  await cachedOwner.close();
  cachedOwner = null;
  logger.debug(`closeStsl: complete`);
}

/**
 * Reset the STSL state. For testing only — does NOT close the connection.
 */
export function resetStsl(): void {
  cachedOwner = null;
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

export async function verifyAdvSearchAttributes(
  connection: SearchAttributeConnectionLike,
  namespace: string,
  projectId: string,
  maxAttempts = 20,
  delayMs = 500,
): Promise<AdvSearchAttributeCheckResult> {
  let lastResult: AdvSearchAttributeCheckResult | undefined;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    lastResult = await checkAdvSearchAttributes(
      connection,
      namespace,
      projectId,
    );
    if (lastResult.ok) return lastResult;
    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  lastResult = await checkAdvSearchAttributes(connection, namespace, projectId);
  return lastResult;
}

/**
 * Replace the cached Temporal connection + client in-place after a
 * stale-connection failure (server restart, gRPC GOAWAY, broken pipe).
 *
 * Behavior (KD-1, KD-3, KD-5):
 *   - Delegates to `TemporalOperationsOwner.reconnect()`. The owner preserves
 *     its own identity, so existing closures that captured the owner pick up
 *     the new connection/client on the next operation.
 *   - Single-flight: concurrent callers await the same in-flight promise.
 *     JS event-loop semantics make TOCTOU impossible.
 *   - On reconnect failure, increments `reconnectFailureCount` and rethrows so
 *     the caller's per-op retry hook can classify + suppress.
 *
 * Throws if STSL is not initialized — production callers always come
 * through the store backend after `initStsl` ran in `plugin-init.ts`.
 */
export async function reinitStsl(): Promise<void> {
  if (inFlightReconnect) {
    return inFlightReconnect;
  }
  if (!cachedOwner) {
    throw new Error("reinitStsl: STSL not initialized — call initStsl first");
  }

  const owner = cachedOwner;
  const promise = (async () => {
    try {
      await owner.reconnect();

      // Re-register ADV search attributes after reconnect. The new connection
      // may point at a fresh Temporal server or namespace, so idempotent
      // registration is required before visibility queries can succeed.
      const lifecycleCtx = makeTemporalLifecycleContext(
        owner.getProjectId(),
        "reinitStsl",
        10_000,
      );
      await owner.registerSearchAttributes(lifecycleCtx);
      const verification = await owner.verifySearchAttributes(lifecycleCtx);
      lastSaVerification = { ok: verification.ok, checkedAt: Date.now() };

      reconnectCount++;
      logger.debug(
        `reinitStsl: success (${owner.getAddress()}/${owner.getNamespace()})`,
      );
    } catch (err) {
      reconnectFailureCount++;
      logger.debug(
        `reinitStsl: failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  })();

  inFlightReconnect = promise.finally(() => {
    inFlightReconnect = null;
  });
  return inFlightReconnect;
}
