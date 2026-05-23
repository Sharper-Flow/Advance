# Contract Traceability

**Change ID:** fixAuditHygiene
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-23T01:17:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Regression in plugin/src/storage/store-temporal/index.test.ts proves warmed memo entries do not hide disk-visible active changes; full pnpm test passed. |
| AC2 | acceptance_criterion | pass | test | Regression in plugin/src/storage/store-temporal/index.test.ts proves completed-task counts survive list conversion; full pnpm test passed. |
| AC3 | acceptance_criterion | pass | test | plugin/src/__tests__/synthetic-cleanup.test.ts covers stale/new synthetic cleanup, real project preservation, marker mismatch; targeted test passed after remediation. |
| AC4 | acceptance_criterion | pass | test | Execution verification recorded hygiene status with synthetic_project_dirs=0 and synthetic_worktree_dirs=0; cleanup mechanism retested by targeted suite. |
| AC5 | acceptance_criterion | pass | test | plugin/src/utils/opencode-session-debt.test.ts covers relative OPENCODE_DB fallback/diagnostics and new session-activity liveness resolver; doctor dry-run reported orphan_ghost would_delete=10. |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/worktree/state-session-lifecycle.test.ts covers AdvWorktreeBranches IS NOT NULL query narrowing and poisoned owner isolation; full pnpm test passed. |
| AC7 | acceptance_criterion | pass | test | Verification after remediation passed: pnpm run check, pnpm test (226 passed, 1 skipped; 2976 passed, 2 skipped), pnpm run build. |
| C1 | constraint | respected | static_check | Fixes are source-backed with regressions and review evidence: active list, synthetic cleanup, DB path/liveness, worktree query tests all present. |
| C2 | constraint | respected | static_check | Worktree WIP change narrows owner query but preserves poisoned workflow evidence for queried owner workflows; no suppression of true owner poison evidence. |
| C3 | constraint | respected | static_check | cleanupSyntheticAdvDirs only removes basename starting 0000000000000000 under two ADV roots and checks marker mismatch; real project ID preservation test passed. |
| C4 | constraint | respected | static_check | Node/Vitest suite and Bun-targeted build passed; doctor script remains Bun shebang and dry-run executed successfully. |
| DONT1 | avoidance | respected | review | Implementation did not terminate/reset Temporal workflows; changes are read-path/query/cleanup/test/script only. |
| DONT2 | avoidance | respected | review | No telemetry infrastructure added; only diagnostics path metadata and dry-run script classification changes. |
| DONT3 | avoidance | respected | review | Synthetic cleanup remains bounded to dataHome/opencode/plugins/advance and dataHome/opencode/worktree with 0000000000000000 prefix guard. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8ea23ee6aa01 | AC1, AC2 | AC1, AC2 | C1, C4 |  |
| tk-e5fe79e73374 | AC3, AC4 | AC3, AC4 | C1, C3, C4, DONT3 |  |
| tk-2860dbbea52b | AC5 | AC5 | C1, C4 |  |
| tk-ebc241d271dd | AC6 | AC6 | C1, C2, C4, DONT1 |  |
| tk-15287f20b65a |  | AC4, AC7 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
