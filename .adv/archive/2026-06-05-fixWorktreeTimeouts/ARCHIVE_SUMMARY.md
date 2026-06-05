# Archive: Fix worktree timeouts

**Change ID:** fixWorktreeTimeouts
**Archived:** 2026-06-05T06:30:36.869Z
**Created:** 2026-06-05T04:40:03.401Z

## Tasks Completed

- ✅ Add tool-wrapper timeout/clamp behavior for worktree cleanup/delete
  > Added WORKTREE_TOOL_SAFE_TIMEOUT_MS=8000 constant, clampToSafeBudget helper, and bounded both adv_worktree_delete and adv_worktree_cleanup tool wrappers with the safe budget. Cleanup clamps oversize timeoutMs, reports effectiveTimeoutMs. Delete gets default safe budget. 4 new tests, all existing tests pass.
- ✅ Remove late pending-delete mutation after timeout
  > Removed void deletePromise.then(...) late-success branch from drainPendingDeletes in worktree/index.ts. Inverted existing test to verify pending delete is retained after timeout (no late background mutation). All 41 tests pass.
- ✅ Bound git remove, workspace cleanup, and post-delete notification
  > Bound git remove with 5s timeout+SIGKILL. Added AbortSignal.timeout(3s) to workspace find/delete ops. Reduced signal timeout from 10s to 5s. 2 new workspace-warp timeout tests. All 110 tests pass.
- ✅ Update worktree lifecycle spec and docs for bounded tool-facing timeouts
  > Amended rq-worktreeBoundedCleanup01.1 (10s→5s signal, non-blocking warning). Added rq-worktreeBoundedCleanup02 with 5 scenarios (safe budget, clamping, no-late-mutation, git-bounded, workspace-bounded). Synced docs mirror.
- ✅ Run integrated verification for worktree timeout fix
  > Integrated verification: 110/110 tests pass across all 3 affected test files. Typecheck clean. No regressions.

## Specs Modified

