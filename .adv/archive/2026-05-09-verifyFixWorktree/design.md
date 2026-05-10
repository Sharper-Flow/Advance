# Design

## Implementation / Verification Plan

1. Inspect current worktree tool path to confirm whether create/resume still uses signals rather than workflow updates.
2. Run a safe reproduce/verification path for worktree resume/create in current trunk/session using ADV worktree tools where appropriate.
3. If `WorkflowUpdateFailedError` is not reproducible, document verification evidence and prepare closure without code churn.
4. If failure reproduces, add regression coverage for repaired planning/no-registry create/resume and improve agent-visible error classification.
5. Verify focused tests/checks.

## Contracts

- Worktree lifecycle safety remains intact: do not delete unmerged worktrees; use ADV worktree tools for lifecycle.
- No direct mutation of external ADV state.
- If live behavior differs from source because of cached dist, report rebuild/restart requirement rather than overclaiming.

## Test Strategy

- Prefer source-level focused tests for worktree tool behavior and error classification.
- Use live ADV worktree tool invocation only when safe and reversible.
- Run `pnpm run check` or focused tests from `plugin/` before claiming fixed.

## Rollback

Verification-only path has no code rollback. If code changes are needed, keep them localized to worktree tool error/reporting path and revert if tests fail.