# Contract Traceability

**Change ID:** bounceDeployedWorkers
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T21:48:48.792Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Execution gate evidence: runtime deploy sync now refreshes exact-path matching dist/temporal/worker.js processes instead of silent copy-only success; reviewer verdict READY with no findings; final validation passed. |
| SC2 | success_criterion | pass | review | Execution/test evidence covers observable deploy outcomes: bounced workers, no matching workers, and multi-line [ADV:ACTION_REQUIRED] restart block; reviewer verdict READY. |
| SC3 | success_criterion | pass | review | Read-only deploy modes verified: --check and --dry-run do not signal processes and report would-bounce/restart-required action; reviewer verdict READY. |
| AC1 | acceptance_criterion | pass | test | adv_run_test tr_mrclrtro_ecb1071e and full deploy-local suite tr_mrcluunl_47cd562a passed; tests verify exact-path matching worker receives SIGTERM after successful runtime plugin sync. |
| AC2 | acceptance_criterion | pass | test | adv_run_test tr_mrclrtro_ecb1071e and full deploy-local suite tr_mrcluunl_47cd562a passed; tests verify matching scoped to synced runtime plugin path and unrelated Node/Bun processes excluded. |
| AC3 | acceptance_criterion | pass | test | adv_run_test tr_mrclrtro_ecb1071e and full deploy-local suite tr_mrcluunl_47cd562a passed; tests verify non-zero deploy failure plus multi-line [ADV:ACTION_REQUIRED] path/PID evidence and restart instructions when matching worker cannot be cleared. |
| AC4 | acceptance_criterion | pass | test | adv_run_test tr_mrcls1hr_45f37242 and full deploy-local suite tr_mrcluunl_47cd562a passed; --check and --dry-run remain no-signal and report intended action. |
| AC5 | acceptance_criterion | pass | test | Static spec verification tr_mrcljr2y_a4ee4bd6 confirmed rq-deployWorkerBounce01/rq-deployWorkerBounce02 in spec JSON and docs; full deploy-local suite tr_mrcluunl_47cd562a passed. |
| C1 | constraint | respected | static_check | Scope remains deploy-local worker/workflow bundle refresh; existing source-vs-deployed-runtime session restart boundary for host-loaded tool code remains documented and unchanged. |
| C2 | constraint | respected | static_check | Implementation uses bounded SIGTERM/grace handling for matching workers; no background watcher, restart loop, or unbounded polling introduced. |
| C3 | constraint | respected | static_check | Tests and implementation cover path-scoped matching to deployment target, including quoted/path-with-space safe handling. |
| C4 | constraint | respected | static_check | Read-only mode tests passed for --check and --dry-run; no write/signal behavior added to those modes. |
| DONT1 | avoidance | respected | review | Deploy now reports bounced/no-match/action-required states and fails non-zero when matching workers may remain stale; no silent stale-worker success path remains in covered behavior. |
| DONT2 | avoidance | respected | review | Worker detection is exact deployed runtime path scoped; unrelated Node/Bun processes excluded by tests. |
| DONT3 | avoidance | respected | review | Deploy-local owns refresh action after sync; no manual deployed-runtime file shuffling required. |
| DONT4 | avoidance | respected | review | No Temporal workflow or worker architecture redesign; change limited to deploy-local refresh handling and spec/tests/docs. |
| DONT5 | avoidance | respected | review | No workflow/task semantic changes outside runtime bundle reload behavior; validation passed with only expected NO_DELTAS warning. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Host-loaded dist/index.js hot reload remains out of scope; restart guidance remains authoritative. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Remote CI release mechanics not changed; local deploy packaging behavior only. |
| OOS3 | out_of_scope | not_applicable | not_applicable | adv_temporal_worker_restart not replaced; it remains operator recovery tooling. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8859433af976 | AC5 | AC5 | C1, C2, C4, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
| tk-9661a4bc8ea5 | SC1, SC2, SC3, AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
| tk-2f777ace9318 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5 | OOS1, OOS2, OOS3 |  |
