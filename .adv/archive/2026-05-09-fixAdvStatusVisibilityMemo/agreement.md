# Discovery Agreement

## Facts

- Issue #57 is open and labeled bug/priority:low.
- `adv_status` can retain deleted/removed change entries in a same-session visibility memo/cache.
- Project wisdom recommends direct Temporal query overlays for gate/archive decisions and cache invalidation discipline via `fireSignalAndRefresh` for workflow state mutation.

## Decisions

- Treat this as cache invalidation/visibility memo bug.
- Preserve status performance but ensure deletion/archive/close visibility changes invalidate stale entries.
- Add regression coverage for same-session status after removal/terminal transition.

## Risks / Unknowns

- Need code inspection to locate visibility memo lifecycle and all mutation paths.
- Must avoid over-invalidating hot status paths if targeted invalidation is possible.

## Out of Scope

- Replacing Temporal visibility as a source.
- Broad status surface redesign.