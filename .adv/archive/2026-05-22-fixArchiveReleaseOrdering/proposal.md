# Fix archive release ordering

## Why

Archive sign-off currently has a sequencing hole for auto-managed changes.

Observed during `fixReentryTaskLookup`:

1. `adv_gate_complete release` refused to run before the change branch was reachable from trunk (`RELEASE_REQUIRES_TRUNK_MERGE`).
2. `adv_change_archive phase9:run` then successfully merged/pushed trunk and archived/completed the change workflow.
3. The archive flow deleted or invalidated the change worktree before release-gate metadata could be recorded.
4. A retry of `adv_gate_complete release` failed with `workflow execution already completed | WorkflowNotFoundError`, then target-path/worktree-isolation errors.

End state was partially correct but inconsistent: archive status and git reachability were correct, but the release gate stayed pending.

## What Changes

- Make the archive/sign-off flow record release completion and archive finalization in a deterministic order.
- Preserve the Phase 9 safety requirement: no release completion without merge/reachability/push evidence.
- Support terminal/completed-workflow recovery when archive status is already correct and release metadata is the only stale projection.
- Avoid requiring manual worktree rematerialization after archive cleanup.
- Add post-archive wayfinding so agents/sessions return attention to the main/default-branch checkout after the change worktree is cleaned up; this should be terminal-neutral and may mention Warp only as an optional UX surface.

## Success Criteria

- Archive sign-off for an auto-managed worktree ends with `status: archived` and `release` gate done.
- Phase 9 merge/push/reachability evidence remains required before release completion is recorded.
- Retrying archive after a completed workflow can reconcile release metadata without manual worktree recreation.
- Healthy archive paths still merge/push/archive exactly once and do not weaken safeguards.
- Post-archive terminal report/guidance tells agents where to continue from (`$MAIN` / default branch) after worktree cleanup.
- Targeted tests, `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.

## Scope

### In Scope

- `adv_change_archive` / archive Phase 9 ordering and recovery behavior.
- `adv_gate_complete release` interaction with archived/completed workflows.
- Worktree cleanup ordering when archive finalization succeeds.
- Archive command/tool guidance for returning attention to the main/default-branch checkout after cleanup.
- Tests for release gate + archive status consistency.

### Out of Scope

- Broad rewrite of the archive workflow.
- Changing proposal/discovery/design/planning/execution/acceptance gates.
- Reworking task completion semantics; another agent owns `fixTaskCompletion` / `fixCompletionSemantics`.
- Worktree Warp smoke failures except where directly touched by archive cleanup ordering.
- Hard dependency on Warp navigation APIs.

### Must Not

- Must not mark release complete without structural Phase 9 evidence.
- Must not rely on chat history or heuristic inference for release completion.
- Must not require manual ADV state-file edits.
- Must not require manual worktree rematerialization to finish archive metadata.
- Must not pretend a tool can change the caller's shell CWD unless the terminal API actually supports it.

## Evidence

- `fixReentryTaskLookup` archived and merged/pushed (`438a7aa`) but release gate metadata remained pending.
- Follow-up agenda: `ag-XsBx06Pn`.
