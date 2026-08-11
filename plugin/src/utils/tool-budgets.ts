/**
 * Shared host-tool budget constants.
 *
 * The status path gets its own budget below; its owner must pass this value
 * when creating the request context.
 */
export const DEFAULT_TOOL_TIMEOUT_MS = 10_000;

/**
 * Reserve for assembling a degraded status result and serializing it.
 *
 * Measurement: 100 iterations of a synthetic 3,670,196-character health
 * payload (1,000 changes, 8 tasks per change, 500 recommendations), including
 * degraded-result assembly, health projection, and formatToolOutput with the
 * production 21,000-character cap, had a 132.262634 ms maximum on 2026-08-04.
 * The reserve is ceil(max * 1.5) = 199 ms; the factor covers normal scheduler
 * variance without inventing a round-number margin.
 *
 * A larger reserve makes the status read degrade more often under load because
 * it shortens the available read budget. That completeness trade is intentional:
 * bounded typed failure is safer than letting an opaque host timeout win.
 */
export const TOOL_RESPONSE_HEADROOM_MS = 199;

/**
 * Status-local aggregate read budget. Keep this derived from the host cap so
 * changing either source constant cannot silently erase the response margin.
 */
export const STATUS_READ_DEADLINE_BUDGET_MS =
  DEFAULT_TOOL_TIMEOUT_MS - TOOL_RESPONSE_HEADROOM_MS;

/**
 * Ceiling for a lock wait started at the very beginning of a host-tool
 * invocation. The lock must leave the same response headroom as other bounded
 * tool work so a timeout can be reported before the host safety-net fires.
 *
 * This is only the ceiling. A wait that starts later in the invocation is sized
 * against the *remaining* budget by `deriveLockBudgetMs`.
 */
export const LOCK_ACQUISITION_DEADLINE_BUDGET_MS =
  DEFAULT_TOOL_TIMEOUT_MS - TOOL_RESPONSE_HEADROOM_MS;

/** Bounded default wait for a lock caller with no outer deadline. */
export const DEFAULT_LOCK_BUDGET_MS = 15_000;

/**
 * Derives the wait budget for a file-lock acquisition.
 *
 * Single derivation point for `rq-toolBudgetNesting01`.
 *
 * Inside a host-tool invocation the budget is derived from what remains of the
 * outer budget, minus the response reserve, so the inner wait can never exceed
 * the outer budget (AC5). Outside one — CLI, plugin startup — no outer deadline
 * exists and the caller's own bounded default applies (AC6). An explicit
 * caller-supplied timeout only ever lowers the result.
 *
 * @param requestedMs caller-supplied timeout, if any
 * @param remainingOuterBudgetMs remaining outer tool budget, if inside a tool
 */
export function deriveLockBudgetMs(
  requestedMs: number | undefined,
  remainingOuterBudgetMs: number | undefined,
): number {
  const requested = requestedMs ?? DEFAULT_LOCK_BUDGET_MS;
  if (remainingOuterBudgetMs === undefined) return Math.max(0, requested);
  const ceiling = Math.min(
    LOCK_ACQUISITION_DEADLINE_BUDGET_MS,
    remainingOuterBudgetMs - TOOL_RESPONSE_HEADROOM_MS,
  );
  return Math.max(0, Math.min(requested, ceiling));
}
