# Archive: Fix wedged worktree cleanup

**Change ID:** fixWedgedWorktreeCleanup
**Archived:** 2026-06-27T20:25:30.520Z
**Created:** 2026-06-25T14:51:15.661Z

## Tasks Completed

- ✅ Implement cleanup deadline core and drain budget ownership
  > Added wrapper-to-cleanup internal item budget below the 8000ms safe tool budget, lowered default pending-delete item budget to 7500ms, and added low-budget retention behavior that records TIME_BUDGET_EXHAUSTED/time_budget_exhausted before starting mutating delete work. Updated tests to assert cleanup passes an internal item timeout and low-budget pending deletes retain without starting late mutation.
- ✅ Add bounded terminal proof and pending-delete authority handling
  > Added bounded cleanup-local change status reads for terminal cleanup discovery and missing-registry ADV branch verification, returning temporal_read_timeout/temporal_read_failed blockers instead of hanging. Added optional PendingDeleteAuthority metadata to pending-delete records with backward-compatible parsing/preservation. Added regression coverage for missing-registry terminal read timeout.
- ✅ Bound PR/git evidence and archive-repair cleanup_merged partial results
  > Made adv_archive_repair cleanup_merged resilient to per-branch delete failures by catching deleteChangeBranch exceptions and returning structured blocked results with localDeleted:false/remoteDeleted:false while continuing later candidates. Added regression coverage for a thrown deletion followed by a successful candidate.
- ✅ Run contract verification sweep and update specs only if public behavior changed
  > Task checkpoint completed
- ✅ Record runtime restart and pokeedge live validation handoff
  > Recorded runtime validation boundary: source tests passed in this session, but live ADV tool code is host-loaded and requires `pnpm run build`, `./scripts/deploy-local.sh --fix`, and OpenCode/plugin host restart before re-testing pokeedge cleanup. This satisfies the AC7/SC6 handoff without substituting manual git cleanup for the structural fix.

## Specs Modified

