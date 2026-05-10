# Discovery Agreement

## Facts

- Issue #54 is open and labeled bug/priority:medium.
- `adv_change_close` can fail when the change workflow is already terminated, leaving stale changes hard to close.
- Project wisdom on Temporal recovery emphasizes classifying missing/poisoned workflow states and using projection fallback carefully.

## Decisions

- Treat this as a recovery/fallback bug, not permission loosening.
- Preserve close approval/audit requirements.
- Implement fallback only when durable projection/state exists and policy permits close.

## Risks / Unknowns

- Need code inspection to find close workflow error boundaries and projection availability.
- Must not mask genuinely missing/invalid change IDs.

## Out of Scope

- Removing Temporal as source of truth for live changes.
- Bypassing user approval/audit checks for close operations.