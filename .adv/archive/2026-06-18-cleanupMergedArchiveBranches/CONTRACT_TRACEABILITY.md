# Contract Traceability

**Change ID:** cleanupMergedArchiveBranches
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-17T23:29:17.174Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv_archive_repair cleanup_merged action provides operator-explicit cleanup; AC1-AC12 verified pass |
| SC2 | success_criterion | pass | review | git branch -d invariant (never -D) + worktree safety belt-and-suspenders; AC4/AC6 verified pass |
| SC3 | success_criterion | pass | review | AGENTS.md updated (commit 72d05f61); rq-archiveBranchCleanup01 spec added |
| SC4 | success_criterion | pass | review | Operator-explicit tool only; no daemons, no session-start hooks, no scheduling |
| AC1 | acceptance_criterion | pass | test | T3 handler tests: cleanup_merged scan lists candidates with merge proof (tree-identical / patch-equivalent) |
| AC2 | acceptance_criterion | pass | test | T3 test: cleanup_merged dryRun returns candidates without deleting |
| AC3 | acceptance_criterion | pass | test | T3 test: cleanup_merged filters non-archived changes |
| AC4 | acceptance_criterion | pass | test | T3 non-regression guard: deleteChangeBranch calls branch -d only; existing 5 tests cover refusal path |
| AC5 | acceptance_criterion | pass | test | T3 test: cleanup_merged tolerates remote-already-deleted as warning |
| AC6 | acceptance_criterion | pass | test | T2 test: worktree list --porcelain exclusion; T3 test: cleanup_merged excludes branches checked out in worktrees |
| AC7 | acceptance_criterion | pass | test | T3 source-level non-regression guard: archiveMode === 'direct' gate at change.ts:4436-4441 unchanged |
| AC8 | acceptance_criterion | pass | test | T4 test: summary view includes recommendation line when archived merged branches detected |
| AC9 | acceptance_criterion | pass | test | T4 test: hygiene view includes archived_branch_hygiene field with per-branch detail |
| AC10 | acceptance_criterion | pass | test | T5 grep verification: 1 reference to adv_archive_repair action=cleanup_merged in AGENTS.md |
| AC11 | acceptance_criterion | pass | test | 153 tests pass across archive-repair (11), git-finalize (80), status (42), porcelain-parser (5), triage (13) |
| AC12 | acceptance_criterion | pass | test | T5 spec read-back: FOUND rq-archiveBranchCleanup01 5 scenarios; advance-workflow version 1.18.0 |
| C1 | constraint | respected | static_check | Code review: handler invoked only via explicit tool call; no scheduling, no daemons, no session hooks |
| C2 | constraint | respected | static_check | KD4: getCheckedOutChangeBranches via reused porcelain parser + git branch -d second guard |
| C3 | constraint | respected | static_check | deleteChangeBranch reuses existing primitive; source review confirms branch -d only |
| C4 | constraint | respected | static_check | T3 source-level non-regression guard test |
| C5 | constraint | respected | static_check | All touched files in Sharper-Flow/Advance; no cross-repo code paths |
| DONT1 | avoidance | respected | review | No background code introduced |
| DONT2 | avoidance | respected | review | No pre-PR sync logic; #169 is separate concern |
| DONT3 | avoidance | respected | review | No artifact cleanup; addArchiveCleanupScanner is separate in-flight change |
| DONT4 | avoidance | respected | review | Phase 9 finalization mechanics unchanged; only additive action enum extension |
| DONT5 | avoidance | respected | review | No auto-invocation; handler requires explicit action=cleanup_merged from operator |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out-of-scope per agreement (issue #169 owns) |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out-of-scope per agreement (addArchiveCleanupScanner owns) |
| OOS3 | out_of_scope | not_applicable | not_applicable | Out-of-scope per agreement (single-repo scope C5) |
| OOS4 | out_of_scope | not_applicable | not_applicable | Out-of-scope per agreement (UD4: advance repo only) |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7d4670063af0 | AC1, AC4 | AC1, AC4, AC11, SC1, SC2 |  |  |
| tk-01261e9a6335 | AC6 | AC6, AC11, SC2 |  |  |
| tk-4002c20fb123 | AC1, AC2, AC3, AC5, SC1 | AC1, AC2, AC3, AC5, AC7, AC11, SC1, SC2 | C1, C3, C4, DONT1, DONT5 |  |
| tk-fb331d11488d | AC8, AC9 | AC8, AC9, AC11, SC3 | C1 |  |
| tk-0ee4cd8d4796 | AC10, AC12 | AC10, AC12, SC3, SC4 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
