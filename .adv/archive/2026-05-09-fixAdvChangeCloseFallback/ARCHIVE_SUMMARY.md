# Archive: Fix adv_change_close fallback for terminated workflows

**Change ID:** fixAdvChangeCloseFallback
**Archived:** 2026-05-09T21:31:14.527Z
**Created:** 2026-05-09T02:45:57.492Z

## Tasks Completed

- ✅ Add failing regression coverage for terminated workflow close fallback and invalid missing-change behavior.
  > Added isWorkflowCompletedError helper + failing tests for terminated workflow close. Committed in worktree.
- ⏭️ Implement safe projection-backed close fallback preserving approval/audit requirements.
- ⏭️ Run focused close/recovery tests and plugin check; document verification evidence.
- ✅ Implement safe projection-backed close fallback preserving approval/audit requirements.
  > Implemented close/closeBatch fallback: catch completed-workflow errors, return disk-backed change. All tests pass.
- ✅ Run focused close/recovery tests and plugin check; document verification evidence.
  > Verification: typecheck clean, all 2001 tests pass (only pre-existing overlay-sync failure). 8 unit tests for isWorkflowCompletedError.

## Specs Modified

