# Archive: Resolve open Advance GitHub bug queue

**Change ID:** resolveOpenAdvanceGithubBug
**Archived:** 2026-05-04T19:13:00.367Z
**Created:** 2026-05-04T17:46:51.451Z

## Tasks Completed

- ✅ #37 checkpoint recovery: add red tests and implement phase-aware clean-tree retry so committed checkpoint partial success can be recorded/retried without misleading clean semantics or silent ledger success.
  > Implemented #37 checkpoint recovery tests/fix, plus inline blocker fix for adv_run_test outer safety-net timeout. Verified build and targeted vitest suites. Checkpoint recorded clean at facdaa1ab1dadfc8a22c16d2d8d0961bf61abb50.
- ✅ #36/#38 worktree cleanup: add red tests and implement deletion routing for missing-from-disk registry cleanup and clean merged non-ADV branches while preserving dirty/unmerged/active ADV blocks.
  > Added regression coverage and deletion routing for #36/#38. Missing-from-disk registry entries now remove stale registry/pending-delete state before ADV integration when path and branch are gone. Non-ADV registry entries without changeId now use merged-to-default routing and skip archived-change requirement while preserving dirty/unmerged blocks. Verified targeted tests, check, and build. Checkpoint ea8d72265a05f1c47cca6345244bf5dc876d3ecd.
- ✅ #33 temporal health/status: add red tests and implement serviceability precedence for diagnose and stale-queue/status warnings, including health-probe composition.
  > Added #33 regression coverage and serviceability precedence in adv_status. Stale queue recommendations are now suppressed for the active project queue when queue serviceability is proven by fresh server poller evidence. Existing diagnose path already gates stale-queue recovery by queueServiceability. Verified temporal health/serviceability tests, check, and build. Checkpoint 3098812bb88b6fc4c1c00693860799776455b4b3.

## Specs Modified

