# Archive: Fix external-state hygiene leftovers and test-isolation leak

**Change ID:** fixExternalStateHygiene
**Archived:** 2026-05-09T21:31:15.409Z
**Created:** 2026-05-09T02:44:07.398Z

## Tasks Completed

- ✅ Add failing regression tests for synthetic external-state/worktree leak and valid in-repo archive hygiene output.
  > Added regression test expectations: hygiene detector no longer flags in-repo archive as legacy. Extended check-test-isolation with getWorktreeBase/getDataHome detection.
- ✅ Fix hygiene/test isolation logic so synthetic dirs are temp/marker scoped and current archive policy is not flagged as drift.
  > Implemented: A5 hygiene detector update (in-repo archive no longer flagged). A4 prevention via extended check-test-isolation. Status tests pass, typecheck clean, pnpm run check clean.
- ✅ Run focused tests and plugin check; document any required live-session rebuild/restart caveat.
  > Verification: typecheck clean, lint clean, format clean, all status tests pass. check-test-isolation tests pass. Only pre-existing overlay-sync failure.

## Specs Modified

