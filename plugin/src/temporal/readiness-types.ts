/**
 * Typed response envelope for the ADV session-readiness fail-closed barrier.
 *
 * This envelope is intentionally distinct from:
 * - `ADV_PLUGIN_INIT_FAILED` (plugin initialization failed, every adv_* tool is
 *   stubbed), and
 * - `no_poller` / `TemporalWorkflowDiagnostic["class"]` (the workflow is
 *   mutation-ineligible because no worker is polling it).
 *
 * `ADV_SESSION_NOT_READY` means the session has not (yet) proven readiness for
 * the target queue / change workflow. The caller should retry after the next
 * orphan-adoption heartbeat, without relying on an exact ETA because poller
 * staleness cannot distinguish queue saturation from shutdown.
 */

export const ADV_SESSION_NOT_READY_KIND = "ADV_SESSION_NOT_READY" as const;

export const ADV_PLUGIN_INIT_FAILED_STATUS = "ADV_PLUGIN_INIT_FAILED" as const;

export const NO_POLLER_CLASS = "no_poller" as const;

/**
 * Stable, caller-parseable retry hint for `ADV_SESSION_NOT_READY`.
 *
 * No exact ETA is included. The ~10s cadence is the orphan-adoption heartbeat
 * period; callers should retry after the next heartbeat tick rather than
 * polling on a fixed deadline.
 */
export const ADV_SESSION_READINESS_RETRY_HINT =
  "ADV session not ready; orphan-adoption heartbeat runs on a ~10s cadence. retry-after-heartbeat: wait for the next heartbeat and retry. Do not rely on an exact ETA because poller staleness cannot distinguish queue saturation from shutdown." as const;

/**
 * Structured form of the retry guidance, for callers that prefer typed access.
 */
export interface AdvSessionNotReadyRetryHint {
  /** Orphan-adoption heartbeat cadence, in milliseconds. */
  heartbeatCadenceMs: 10_000;
  /** Caller action: wait for the next heartbeat, then retry. */
  advise: "retry-after-heartbeat";
  /** Human-readable explanation matching the stable string hint. */
  message: string;
}

export interface AdvSessionNotReady {
  kind: typeof ADV_SESSION_NOT_READY_KIND;
  blockers: string[];
  retryHint: string;
}

export interface AdvPluginInitFailedLike {
  status: "ADV_PLUGIN_INIT_FAILED";
  message: string;
  error: string;
  directory: string;
  remediation: string[];
}

export function isAdvSessionNotReady(
  value: unknown,
): value is AdvSessionNotReady {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === ADV_SESSION_NOT_READY_KIND
  );
}

export function isAdvPluginInitFailed(
  value: unknown,
): value is AdvPluginInitFailedLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { status?: unknown }).status === ADV_PLUGIN_INIT_FAILED_STATUS
  );
}

export function isNoPoller(value: unknown): value is { class: "no_poller" } {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { class?: unknown }).class === NO_POLLER_CLASS
  );
}

export type ClassifiedAdvEnvelope =
  | { kind: "session-not-ready"; payload: AdvSessionNotReady }
  | { kind: "init-failed" }
  | { kind: "no-poller" }
  | { kind: "unknown" };

export function classifyAdvEnvelope(value: unknown): ClassifiedAdvEnvelope {
  if (isAdvSessionNotReady(value)) {
    return { kind: "session-not-ready", payload: value };
  }
  if (isAdvPluginInitFailed(value)) {
    return { kind: "init-failed" };
  }
  if (isNoPoller(value)) {
    return { kind: "no-poller" };
  }
  return { kind: "unknown" };
}

/**
 * Convenience factory that builds a typed `ADV_SESSION_NOT_READY` envelope
 * from raw blocker strings. The first blocker is always the envelope's own
 * kind identifier so callers can surface it generically.
 */
export function createAdvSessionNotReadyEnvelope(
  blockers: string[],
  retryHint = ADV_SESSION_READINESS_RETRY_HINT,
): AdvSessionNotReady {
  const distinct = [...new Set([ADV_SESSION_NOT_READY_KIND, ...blockers])];
  return {
    kind: ADV_SESSION_NOT_READY_KIND,
    blockers: distinct,
    retryHint,
  };
}

/**
 * Structured retry hint, useful for callers that want to parse the cadence
 * programmatically rather than parsing the stable string.
 */
export function getAdvSessionNotReadyRetryHint(): AdvSessionNotReadyRetryHint {
  return {
    heartbeatCadenceMs: 10_000,
    advise: "retry-after-heartbeat",
    message: ADV_SESSION_READINESS_RETRY_HINT,
  };
}
