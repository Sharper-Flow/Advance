# Verify or fix worktree WorkflowUpdateFailedError after repair

## Intent

Resolve bug #48: ADV worktree create/resume can fail with generic `WorkflowUpdateFailedError` after repair even when diagnostics are clean.

## Scope

- Reproduce or verify the reported worktree failure path for repaired/no-divergence change state.
- Improve worktree create/resume error reporting if failures still collapse to generic workflow errors.
- Add regression coverage for repaired planning state and empty worktree registry create/resume paths.
- If recent changes already fixed this, record verification evidence and avoid unnecessary code churn.

## Success Criteria

- Worktree create/resume either succeeds in the reported clean state or returns actionable semantic errors.
- Generic `WorkflowUpdateFailedError` is no longer the only agent-visible recovery signal for this class.
- Regression tests or verification evidence cover repaired planning/no-registry cases.
- Relevant checks pass.