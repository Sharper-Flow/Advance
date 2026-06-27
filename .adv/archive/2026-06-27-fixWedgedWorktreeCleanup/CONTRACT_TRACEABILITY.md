# Contract Traceability

**Change ID:** fixWedgedWorktreeCleanup
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T19:19:48.422Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; cleanup wrapper passes cleanupItemTimeoutMs below 8000ms; tests tr_mqwqc7h9_b3062b5b and post-review tr_mqwqs58a_72877e7d passed. |
| SC2 | success_criterion | pass | review | readChangeStatusWithCleanupTimeout bounds terminal reads; missing-registry timeout regression tr_mqwq519d_16ecd69c passed. |
| SC3 | success_criterion | pass | review | Pending deletes retained with typed classes; deletion success clears queue; index-delete regression suite passed tr_mqwqc7h9_b3062b5b. |
| SC4 | success_criterion | pass | review | archive_repair cleanup_merged catches per-branch delete failure and continues; test tr_mqwq9o5x_d52da084 and sweep tr_mqwqc7h9_b3062b5b passed. |
| SC5 | success_criterion | pass | review | Low-budget drain tests verify deleteWorktree is not called and pending delete is retained before response; post-review shared-budget regression passed tr_mqwqs58a_72877e7d. |
| SC6 | success_criterion | pass | review | Task tk-c16ffd72c76f records rebuild/deploy/restart and pokeedge fixStagingDigestResolution retry handoff. |
| AC1 | acceptance_criterion | pass | test | adv-worktree wrapper test and combined sweep passed: tr_mqwpykm2_b4554481, tr_mqwqc7h9_b3062b5b. |
| AC2 | acceptance_criterion | pass | test | Missing-registry terminal read timeout RED/GREEN: tr_mqwq3hej_42702578 → tr_mqwq519d_16ecd69c; verify tr_mqwq67fz_04e4416d. |
| AC3 | acceptance_criterion | pass | test | archive-repair per-branch blocked-result regression RED/GREEN: tr_mqwq90fs_68c40ea0 → tr_mqwq9o5x_d52da084; verify tr_mqwq9yej_b0fc4662. |
| AC4 | acceptance_criterion | pass | test | index-delete suite covers archived-clean, squash exact/ancestor/post-pr/no-pr, missing-registry timeout, pending-delete retention; tr_mqwqc7h9_b3062b5b passed. |
| AC5 | acceptance_criterion | pass | test | Low-budget no-late-mutation tests and shared-budget post-review regression passed: tr_mqwq0g98_619cb029, tr_mqwqs58a_72877e7d. |
| AC6 | acceptance_criterion | pass | test | Targeted sweep tr_mqwqc7h9_b3062b5b passed; typecheck tr_mqwqcm19_336c6f6e and post-review tr_mqwqsgxv_d7c23cd5 passed. |
| AC7 | acceptance_criterion | pass | test | tk-c16ffd72c76f notes exact sequence: pnpm run build, ./scripts/deploy-local.sh --fix, restart OpenCode/plugin host, retry pokeedge cleanup with ADV tools. |
| C1 | constraint | respected | static_check | Static scan: production git worktree remove remains centralized at worktree/index.ts gitWorktreeRemove; no new direct removal caller added. |
| C2 | constraint | respected | static_check | Static scan: verifyNonAdvBranchIntegration still falls through to verifyPrMergedChangeBranchIntegration/prMergeEvidence for squash branches. |
| C3 | constraint | respected | static_check | Implementation only edits source/test files; ADV state mutations performed through ADV tools; no ADV state files read/edited directly. |
| C4 | constraint | respected | static_check | DEFAULT_PENDING_DELETE_ITEM_TIMEOUT_MS is 7500; wrapper passes cleanupItemTimeoutMs; readChangeStatusWithCleanupTimeout bounds store.changes.get(changeId). |
| C5 | constraint | respected | static_check | Existing index-delete tests for dirty, unmerged, non-terminal, in-use all passed in tr_mqwqc7h9_b3062b5b. |
| C6 | constraint | respected | static_check | Preview URL: not_applicable; implementation changed TypeScript tool/runtime and tests only, no UI/browser-visible output. |
| DONT1 | avoidance | respected | review | No live/manual pokeedge cleanup executed; handoff explicitly forbids manual deletion as substitute. |
| DONT2 | avoidance | respected | review | Changes limited to worktree cleanup/delete/archive-repair behavior; no pokeedge release pipeline or broad release-gate recovery redesign. |
| DONT3 | avoidance | respected | review | Correctness uses typed results/reasons and tests, not chat/log parsing. |
| DONT4 | avoidance | respected | review | Budget-exhausted paths record pending-delete failure before return and avoid starting delete; tests verify deleteWorktree not called. |
| DONT5 | avoidance | respected | review | Successful deletion path still clears session/pending delete and reaps empty parents; retained paths preserve retry state. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-86283eaac8bd | AC1, AC5, C4, DONT4 | AC1, AC5 | C1, C3, C5, DONT5 |  |
| tk-32105ded638a | AC2, AC4, SC2, SC3 | AC2, AC4 | C1, C3, C5, DONT1, DONT5 |  |
| tk-c2422b013df2 | AC3, SC4, C2, C4 | AC3 | C1, C2, C5, DONT2, DONT5 |  |
| tk-554bb2d7ff22 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, C1, C2, C3, C4, C5 | DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-c16ffd72c76f | AC7, SC6 | AC7, SC6 | DONT1, DONT2 |  |
