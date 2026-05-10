# Discovery Agreement

## Facts

- Issue #88 reports `adv_change_archive` seeing incomplete gates while gate status reports complete.
- ADV gate state is workflow-owned; disk projections and in-memory caches can lag.
- Project wisdom says gate/archive decisions should overlay direct Temporal workflow queries and validate `GatesSchema` instead of trusting cached store state alone.

## Decisions

- Treat authoritative gate status as source of truth for archive preflight.
- Refresh or bypass stale projection/cache before blocking archive.
- Preserve blocking behavior for genuinely incomplete gates.

## Risks / Unknowns

- Archive paths may use both workflow query and disk-projection fallback.
- Fix must not mask real incomplete-gate state when Temporal is unavailable.

## Out of Scope

- Broad archive redesign.
- Weakening seven-gate archive requirement.