# Archive: Fix adv_status visibility memo stale deleted change entries

**Change ID:** fixAdvStatusVisibilityMemo
**Archived:** 2026-05-09T21:31:14.889Z
**Created:** 2026-05-09T02:47:08.208Z

## Tasks Completed

- ✅ Add failing regression coverage for same-session adv_status after change deletion/removal or terminal visibility invalidation.
  > Added regression coverage for terminal summaries in ChangeSummaryMemo and implemented active-fast-path filtering so archived/closed memo entries cannot pin deleted/terminal changes in same-session status/list output. Focused memo tests pass.
- ✅ Implement scoped visibility memo invalidation/reconciliation for deleted/archived/closed change entries.
  > Implemented scoped memo reconciliation in listResolvedChanges: default active-list fast path filters memo summaries to non-terminal statuses before returning, so archived/closed entries no longer remain visible until session restart. Terminal-inclusive list calls still take slow path and can include archive/closed data when explicitly requested.
- ✅ Run focused status/cache tests and plugin check; document verification evidence.
  > Verification passed. Focused status/cache tests passed (38 tests). pnpm run check passed (typecheck, check-test-isolation, lint, format:check). Live current session may require plugin reload/rebuild before live adv_status uses changed source.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Status/list memo fast paths must exclude terminal summaries unless caller explicitly requests terminal statuses. Keep archived/closed reads on slow path so visibility/disk/archive sources can reconcile true terminal state without pinning same-session active lists.
