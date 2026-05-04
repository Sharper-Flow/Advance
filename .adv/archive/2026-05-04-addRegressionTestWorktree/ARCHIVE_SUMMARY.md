# Archive: Add regression test for worktree creation when peer session holds worker lock

**Change ID:** addRegressionTestWorktree
**Archived:** 2026-05-04T16:13:43.673Z
**Created:** 2026-05-04T15:56:19.696Z

## Tasks Completed

- ✅ Add GH#35 regression test to project-workflow-helper.test.ts: no local worker + peer holds worker.lock + fresh server-side pollers + recovery:once → workflow-backed, no restart attempted
  > Added GH#35 regression test block (2 tests) to project-workflow-helper.test.ts. Tests verify: no local worker + peer holds worker.lock + active server-side pollers + recovery:once → workflow-backed without restart attempt. Both fresh and stale poller scenarios covered.

## Specs Modified

