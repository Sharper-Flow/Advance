# Temporal telemetry posture

Advance currently uses minimal, in-process Temporal diagnostics. This is
intentional for the local OpenCode plugin runtime.

## Current surfaces

- `adv_status view:"health"` reports Temporal server reachability, worker
  serviceability, search-attribute health, worker diagnostics, and session-local
  ADV tool-call counters.
- `adv_temporal_diagnose` reports reachability for the server, STSL, worker, and
  a specific change workflow when a change id is provided.
- `plugin/src/utils/metrics.ts` tracks session-local ADV tool usage. Counters
  reset on plugin init and are not persisted.
- `plugin/src/temporal/retry-wrapper.ts` tracks last retry/error telemetry for
  Temporal operations. `getTemporalOpTelemetry()` and `temporalOpLatency` are
  placeholders for future per-operation counters.

## Deliberate non-goals

- No Prometheus exporter.
- No OpenTelemetry dependency.
- No persistent metrics database.
- No cross-session aggregation.

## When to add counters

Add lightweight in-memory counters only when a concrete diagnostic gap appears
in local operation. Keep any future counters near `retry-wrapper.ts` or the
Temporal adapter that owns the operation, and surface them through the existing
health view instead of introducing new infrastructure.

For the task-completion semantics work, the current health and retry surfaces
are sufficient. The change should focus on truthful checkpoint completion
results and clear task lifecycle state, not observability platform expansion.
