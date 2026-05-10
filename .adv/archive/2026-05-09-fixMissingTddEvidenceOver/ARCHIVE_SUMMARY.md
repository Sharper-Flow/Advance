# Archive: Fix MISSING_TDD_EVIDENCE over-triggering on data and constant tasks

**Change ID:** fixMissingTddEvidenceOver
**Archived:** 2026-05-09T21:31:15.519Z
**Created:** 2026-05-09T02:45:57.487Z

## Tasks Completed

- ✅ Add failing regression tests for data/constant tasks not triggering MISSING_TDD_EVIDENCE and behavior tasks still requiring evidence.
  > Failing regression tests added: 10 data/constant titles → not_required, 4 behavior titles → still missing. Committed in worktree.
- ⏭️ Implement structural validation/classification fix so TDD evidence applies only to TDD-applicable tasks.
- ⏭️ Run focused validator tests and plugin check; document verification evidence and live-session rebuild caveat if needed.
- ✅ Implement structural validation/classification fix so TDD evidence applies only to TDD-applicable tasks.
  > Implementation done: added 11 data/constant patterns to TDD_TRIVIAL_PATTERNS. All classifier + completeness tests pass.
- ✅ Run focused validator tests and plugin check; document verification evidence and live-session rebuild caveat if needed.
  > Verification: typecheck clean, lint clean, all classifier + completeness tests pass. Only pre-existing overlay-sync failure.

## Specs Modified

