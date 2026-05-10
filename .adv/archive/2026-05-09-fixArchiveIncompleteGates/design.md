# Design

## Plan

1. Add regression coverage for authoritative complete gate state with stale/incomplete cached projection.
2. Add regression coverage that genuinely incomplete gates still block archive.
3. Update archive preflight to query/validate authoritative gate state or refresh stale cache before incomplete-gate blocking.
4. Run focused archive tests and repo check.

## Contracts

- Archive can proceed only when all seven gates are satisfied in authoritative state.
- Cache/projection staleness must not block valid archive completion.
- Temporal outage/fallback paths must remain explicit and not silently pass unknown gate state.

## Test Strategy

- RED stale-cache complete-gates archive regression.
- GREEN with authoritative gate overlay/refresh.
- Focused archive tests plus `pnpm run check`.