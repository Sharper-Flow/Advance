# Agreement

## Objectives

1. Recognize `isWorkflowCompletedError`-class errors in `adv_change_archive` recoveryMode branch.
2. Route through the same `saveRecoveredChangeStatus` disk-direct write as poisoned recovery.
3. Preserve healthy and poisoned paths.
4. Verify with tests + full suite.

## Acceptance Criteria

1. When `recoveryMode: poisoned_history` and `store.changes.save({status:"archived"})` throws a "workflow execution already completed" / WorkflowNotFoundError, `adv_change_archive` writes status via `saveRecoveredChangeStatus` and returns success with `_recoveryMutation: true`.
2. Healthy archive (no recoveryMode) still throws on completed-workflow errors (no implicit recovery).
3. Existing poisoned-history archive recovery via describe probe still works.
4. Regression test covers the completed-workflow path.
5. `pnpm run check`, `pnpm run build`, full `pnpm test` pass.

## Constraints

- Recovery only activates when `recoveryMode: poisoned_history` is explicitly set with valid `recoveryEvidence`.
- No new direct fs writes.
- Healthy paths unchanged.

## Sign-Off

User said `all`.