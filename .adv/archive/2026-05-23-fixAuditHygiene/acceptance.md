# Acceptance

Reviewed at: 2026-05-23T01:17:10.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | A test proves `listResolvedChanges()` cannot return only memo entries when other active changes exist in visibility/disk sources. | pass | Regression in plugin/src/storage/store-temporal/index.test.ts proves warmed memo entries do not hide disk-visible active changes; full pnpm test passed. |
| AC2 | acceptance_criterion | A test proves status/list task counts for a previously completed-task change are not flattened to `0/0` by summary conversion. | pass | Regression in plugin/src/storage/store-temporal/index.test.ts proves completed-task counts survive list conversion; full pnpm test passed. |
| AC3 | acceptance_criterion | Synthetic cleanup tests prove stale `0000000000000000*` dirs can be safely reaped and real project IDs are preserved. | pass | plugin/src/__tests__/synthetic-cleanup.test.ts covers stale/new synthetic cleanup, real project preservation, marker mismatch; targeted test passed after remediation. |
| AC4 | acceptance_criterion | Hygiene status reports zero synthetic dirs on this machine after cleanup verification. | pass | Execution verification recorded hygiene status with synthetic_project_dirs=0 and synthetic_worktree_dirs=0; cleanup mechanism retested by targeted suite. |
| AC5 | acceptance_criterion | OpenCode session-debt tests cover relative `OPENCODE_DB` and canonical fallback/diagnostic behavior. | pass | plugin/src/utils/opencode-session-debt.test.ts covers relative OPENCODE_DB fallback/diagnostics and new session-activity liveness resolver; doctor dry-run reported orphan_ghost would_delete=10. |
| AC6 | acceptance_criterion | WIP/worktree tests cover poisoned workflow handling without over-reporting workflows that do not own active worktrees. | pass | plugin/src/tools/worktree/state-session-lifecycle.test.ts covers AdvWorktreeBranches IS NOT NULL query narrowing and poisoned owner isolation; full pnpm test passed. |
| AC7 | acceptance_criterion | `pnpm run check`, `pnpm test`, and `pnpm run build` pass from `plugin/`. | pass | Verification after remediation passed: pnpm run check, pnpm test (226 passed, 1 skipped; 2976 passed, 2 skipped), pnpm run build. |
| C1 | constraint | Use structural source-backed fixes and tests, not prose-only guidance. | respected | Fixes are source-backed with regressions and review evidence: active list, synthetic cleanup, DB path/liveness, worktree query tests all present. |
| C2 | constraint | Preserve explicit recovery evidence for actual poisoned-history workflows. | respected | Worktree WIP change narrows owner query but preserves poisoned workflow evidence for queried owner workflows; no suppression of true owner poison evidence. |
| C3 | constraint | Preserve safe destructive boundaries: no automatic deletion of non-synthetic or real project state. | respected | cleanupSyntheticAdvDirs only removes basename starting 0000000000000000 under two ADV roots and checks marker mismatch; real project ID preservation test passed. |
| C4 | constraint | Keep runtime changes compatible with Bun host and Node/Vitest tests. | respected | Node/Vitest suite and Bun-targeted build passed; doctor script remains Bun shebang and dry-run executed successfully. |
| DONT1 | avoidance | Do not terminate/reset existing Temporal workflows as part of implementation. | respected | Implementation did not terminate/reset Temporal workflows; changes are read-path/query/cleanup/test/script only. |
| DONT2 | avoidance | Do not add heavyweight telemetry infrastructure. | respected | No telemetry infrastructure added; only diagnostics path metadata and dry-run script classification changes. |
| DONT3 | avoidance | Do not broaden cleanup to arbitrary `.local/share/opencode` paths. | respected | Synthetic cleanup remains bounded to dataHome/opencode/plugins/advance and dataHome/opencode/worktree with 0000000000000000 prefix guard. |

