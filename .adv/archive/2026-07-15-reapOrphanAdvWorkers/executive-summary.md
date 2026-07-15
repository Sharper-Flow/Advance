# Executive Summary

## Outcome
ADV Temporal operations now stay resilient under multi-session worker contention (#217 direction 3). The gRPC saturation that previously surfaced as raw `ToolExecutionTimeout`/`ServiceError` and forced manual `adv_temporal_reconnect` is now transparently retried, and the archive path recovers correctly instead of returning a hard failure for a merely-saturated response.

## Delivered value
- **Structural two-axis error classification** — validated gRPC status codes (via a shape-checked `cause`-chain walk with a cycle guard) drive a clean split: saturation/availability codes (RESOURCE_EXHAUSTED, UNAVAILABLE, DEADLINE_EXCEEDED, ABORTED) are *retryable*; only genuine transport failures (ECONNREFUSED, channel shutdown, GOAWAY, broken pipe) are *reconnectable*. Reconnecting the shared connection no longer fires on saturation, so one session's load can't cancel other sessions' in-flight ops (the #217 amplifier). A validated saturation code stays on the retry axis even if the error text contains transport-looking phrases.
- **Archive stale-handle fix** — archive finalization reads now rebuild the workflow handle from the current STSL bundle inside every retry attempt, so a mid-op reconnect actually takes effect (the root cause of the persistent archive `ServiceError`).
- **Idempotent archive reconcile** — the release-gate signal is fired once (no blind re-signal on ambiguous completion); a transient failure triggers exactly one bounded terminal-state reconcile read → already-done on success, a typed classified error otherwise. Completed-workflow recovery is preserved.
- **SDK-aware** — leverages, rather than duplicates, the Temporal Connection's built-in retry interceptor; ADV's added value is DEADLINE_EXCEEDED handling (which the SDK does not retry), handle reacquisition, and reconcile.

## Verification
- `retry-wrapper` 22/22; archive-gate 12/12; combined touched suites 195 passed (`bin/oc-test targeted`, tr_mrmh20qs).
- `pnpm run check` (schemas, typecheck, isolation, lockfile, lint, format) and `pnpm run build` (plugin + worker bundles) green.
- Independent design validator: two rounds (v1 FAIL → v2 CAUTION, zero blockers). Independent acceptance reviewer: **READY**, zero blocking findings (and contributed the saturation-vs-transport-text hardening).

## Risks and follow-ups
- No release-blocking concerns. Deploy/worker-restart intentionally deferred (avoids the mid-change replay-lag hazard); the fix ships to `dist` on build and takes effect on the next operator-controlled restart.
- **Surfaced follow-up (out of scope):** `recordPhase9Status` still fires `phase9StatusUpdatedSignal` through the blind-retry `fireSignalAndRefresh` — same class as the release-gate signal, on a different signal. Candidate for a fast-follow.
- **Deferred (design-noted):** per-session task-queue isolation (#217 dir 2); connect-first/atomic-swap of the shared connection; a broader reacquisition sweep of other pre-resolved-handle call sites.