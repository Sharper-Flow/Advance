# Contract Traceability

**Change ID:** fixWorktreeCleanup
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-27T22:08:36.812Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Post-delete notification/cache refresh bounded in plugin/src/tools/worktree/index.ts; verified by index-delete.test.ts signal timeout test and full targeted suite. |
| AC2 | acceptance_criterion | pass | test | Pending-delete cleanup bounded per item in drainPendingDeletes; verified by index-delete.test.ts timed-out first item continues to later item test. |
| AC3 | acceptance_criterion | pass | test | In-use skip path in drainPendingDeletes verified by index-delete.test.ts does-not-consume-retry-attempts test. |
| AC4 | acceptance_criterion | pass | test | Already-missing pending-delete paths clear in drainPendingDeletes; verified by index-delete.test.ts clears pending deletes whose worktree path is already gone. |
| AC5 | acceptance_criterion | pass | test | MAX_PENDING_DELETE_ATTEMPTS=5 and forceAttempts retry-cap bypass verified by index-delete.test.ts retry-cap tests; review remediation added proof that forceAttempts does not force dirty deletion. |
| AC6 | acceptance_criterion | pass | test | /adv-cleanup and adv-cleanup skill document report-only worktree drift behavior; adv-cleanup-contract-assets tests verify drift groups and non-destructive --execute behavior. |
| AC7 | acceptance_criterion | pass | test | Spec/docs/tests updated for rq-worktreeBoundedCleanup01. Verification passed: pnpm test -- src/tools/worktree/index-delete.test.ts (script ran full suite: 237 passed, 1 skipped), pnpm run check, pnpm run build, eslint, prettier, and strict validation with only NO_DELTAS warning. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1b4505479d2e | AC6, AC7 | AC6, AC7 |  |  |
| tk-6799f7175c8b | AC1 | AC1 |  |  |
| tk-1d1567a1286a | AC2, AC3, AC4, AC5 | AC2, AC3, AC4, AC5 |  |  |
| tk-5999a80259cd | AC6, AC7 | AC6, AC7 |  |  |
| tk-cbd0d7c40d18 | AC7 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 |  |  |
