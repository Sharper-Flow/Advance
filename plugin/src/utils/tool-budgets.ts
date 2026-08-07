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
