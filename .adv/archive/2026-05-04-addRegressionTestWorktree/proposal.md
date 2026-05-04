## Problem

GH#35 exposed a bug where `adv_worktree_create` hard-blocked when a peer session held `worker.lock` with active server-side pollers. The fix (GH#34, a416c0e) added a `probeTaskQueuePollers` check in `getBoundedProjectWorkflowAccess` that routes through the peer's server-side pollers instead of requiring a local worker. No dedicated regression test exists for this specific scenario.

## What

Add a test that verifies: when a peer session holds `worker.lock` with fresh heartbeat AND server-side Temporal pollers are active, `getBoundedProjectWorkflowAccess` returns `workflow-backed` without attempting worker restart or recovery.

## Why

The fix was verified manually via the incident but lacks a targeted regression test. The existing tests cover `probeTaskQueuePollers` and `getBoundedProjectWorkflowAccess` separately, but not the integrated "peer lock + active pollers → success" path that #35 required.

## Success Criteria

- Test passes reproducing the pre-fix failure path (would fail without poller probe)
- Test passes on current code (poller probe returns workflow-backed)
- No changes to production code — test-only change

## Out of Scope

- Production code changes
- Tool timeout investigation (separate issue if it reproduces)