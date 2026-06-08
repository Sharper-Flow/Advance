# Executive Summary

## Outcome
Cache-invalidation gap in `saveRecoveredChangeStatus` fixed. Post-repair, `adv_change_show` now returns the repaired status instead of stale `draft`, unblocking `adv_reflect`.

## Verdict
APPROVED

## What Was Built
1. Added `bestEffortRefresh(store, change.id)` to `saveRecoveredChangeStatus` in `plugin/src/tools/_recovery-writers.ts` after the `saveChange()` disk write. Aligns with the pattern already used by `saveRecoveredTaskMutation` and `saveRecoveredTaskAdd`.
2. Updated file header comment to accurately describe the split cache-refresh policy: task writers and status-transition writer use `bestEffortRefresh`; gate completion and artifact metadata writers intentionally skip refresh.
3. Added unit test in `plugin/src/tools/_recovery-writers.test.ts` asserting `store.changes.refresh` is called with the correct changeId after the status transition.
4. Added integration test in `plugin/src/tools/change.status-repair.test.ts` that uses the real `saveRecoveredChangeStatus` (via `vi.importActual`) and asserts the cache-invalidation side-effect.

## What Was Verified
- Verdict: APPROVED with 0 findings (12-dimension inline review)
- Tests: 19/19 on touched files (11 + 8); full suite 3607/3607 excluding 2 pre-existing failures unrelated to this change (confirmed by baseline run on `c4bf25de`)
- Preview URL: not_applicable — purely backend in-memory cache consistency, no visual surface
- Contract matrix: 14/14 rows pass/respected, 0 failing
- Typecheck pass; lint pass

## Remaining Concerns
None.