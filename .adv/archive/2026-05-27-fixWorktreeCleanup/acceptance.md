# Acceptance

Reviewed at: 2026-05-27T22:08:36.812Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Post-delete notification/cache refresh is bounded; git worktree removal remains authoritative; timeout returns success with warning. | pass | Post-delete notification/cache refresh bounded in plugin/src/tools/worktree/index.ts; verified by index-delete.test.ts signal timeout test and full targeted suite. |
| AC2 | acceptance_criterion | Pending-delete cleanup is bounded per item; timed-out item is retained, actual failed/timeout attempts increment, and later queued items continue. | pass | Pending-delete cleanup bounded per item in drainPendingDeletes; verified by index-delete.test.ts timed-out first item continues to later item test. |
| AC3 | acceptance_criterion | In-use skips do not consume retry attempts; actual failed deletes and timeouts do. | pass | In-use skip path in drainPendingDeletes verified by index-delete.test.ts does-not-consume-retry-attempts test. |
| AC4 | acceptance_criterion | Already-missing pending-delete paths are cleared without retrying forever. | pass | Already-missing pending-delete paths clear in drainPendingDeletes; verified by index-delete.test.ts clears pending deletes whose worktree path is already gone. |
| AC5 | acceptance_criterion | Pending-delete retry cap is enforced at max 5 attempts unless an explicit operator cleanup uses force-attempt semantics. | pass | MAX_PENDING_DELETE_ATTEMPTS=5 and forceAttempts retry-cap bypass verified by index-delete.test.ts retry-cap tests; review remediation added proof that forceAttempts does not force dirty deletion. |
| AC6 | acceptance_criterion | `/adv-cleanup` reports worktree drift groups and does not delete worktrees, even with `--execute`. | pass | /adv-cleanup and adv-cleanup skill document report-only worktree drift behavior; adv-cleanup-contract-assets tests verify drift groups and non-destructive --execute behavior. |
| AC7 | acceptance_criterion | Spec/docs/tests reflect the bounded cleanup law and full verification passes. | pass | Spec/docs/tests updated for rq-worktreeBoundedCleanup01. Verification passed: pnpm test -- src/tools/worktree/index-delete.test.ts (script ran full suite: 237 passed, 1 skipped), pnpm run check, pnpm run build, eslint, prettier, and strict validation with only NO_DELTAS warning. |

