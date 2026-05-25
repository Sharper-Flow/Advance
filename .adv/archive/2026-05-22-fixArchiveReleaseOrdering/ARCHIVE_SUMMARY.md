# Archive: Fix archive release ordering

**Change ID:** fixArchiveReleaseOrdering
**Archived:** 2026-05-22T07:34:42.767Z
**Created:** 2026-05-22T05:22:30.417Z

## Tasks Completed

- ✅ Make adv_change_archive complete release gate before archive status.
  > Added archive-local release gate completion after successful Phase 9 finalization and before archived status transition. The helper signals gateCompletedSignal with completedBy `adv-archive`, polls workflow release gate state until done/stuck, blocks archive status/cleanup if confirmation fails, and returns releaseGate metadata. Added regression test proving release signal fires after finalization and before store.changes.save; blocked finalization does not signal release.
- ✅ Add completed-workflow / existing-bundle release metadata reconciliation.
  > Moved existing-bundle detection before worktreePath enforcement so already-written bundles can be recovered without rematerializing the change worktree. Added main-checkout structural evidence verification for no-worktree retry: direct mode checks change branch reachability and default-branch push; PR mode checks change branch push. Added release gate disk-projection recovery when the workflow is already completed, and changed saveRecoveredGateCompletion to use disk-direct saveChange so archived/completed workflow repair does not call Temporal-backed store.changes.save. Skips archive-status save when status is already archived.
- ✅ Update archive command/report wayfinding and ordering docs.
  > Updated archive sign-off docs so adv_change_archive phase9:run owns Phase 9 and release-gate recording; removed the normal-path instruction to call adv_gate_complete release after finalization. Added terminal-neutral `Continue from: {mainCheckout} ({default-branch})` guidance to archive report and cleanup/completion docs. Added tool output `continueFrom` derived from finalization main checkout/default branch. Updated ADV sign-off voice and command voice standard to match the archive-owned release ordering.
- ✅ Run final verification and coordination checks.
  > Task checkpoint completed

## Specs Modified

