# Contract Traceability

**Change ID:** optimizeAdvToolCalls
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T22:23:45.469Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv_status summary view plan skips hygiene/detail providers; status.test summary view skips archived branch hygiene and detailed-only providers. |
| SC2 | success_criterion | pass | review | Disk benchmark: summary 17.9ms, change_list 1.1ms, adv_run_test true 2.3ms in latest run; temporal mode fail-closed for live setup. |
| SC3 | success_criterion | pass | review | Final verification task recorded 15-row Tron/finding disposition in checkpoint verification. |
| SC4 | success_criterion | pass | review | Probe stale/freshness remains `_freshness` diagnostics; authoritative gates/archive/recovery paths unchanged and still use full state tools. |
| SC5 | success_criterion | pass | review | bench-adv-latency disk report labels mode/substitute/runtime; temporal assertion checks non-zero fail with Remediation and no disk substitute. |
| AC1 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/status.test.ts` passed; summary skips archived branch hygiene and detailed-only providers. |
| AC2 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/status.test.ts` passed; health/hygiene tests retain diagnostics and archived_branch_hygiene in hygiene. |
| AC3 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/probe-cache.test.ts src/tools/status.test.ts` passed; AbortSignal forwarding and stale/timeout behavior covered. |
| AC4 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/temporal/list-change-workflows.test.ts src/temporal/visibility-claim-queries.test.ts src/temporal/search-attributes.test.ts src/temporal/observability.test.ts` passed. |
| AC5 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/test.test.ts` passed; recorded/degraded/not_applicable evidenceRecording statuses and 300ms timeout covered. |
| AC6 | acceptance_criterion | pass | test | Disk benchmark command passed and included mode/substitute/runtime labels; temporal assertion passed by verifying fail-closed remediation/no disk substitute. |
| AC7 | acceptance_criterion | pass | test | Final targeted regression suite passed: 8 files, 128 tests covering status summary, probe cache, adv_run_test, Visibility, observability, latency report. |
| AC8 | acceptance_criterion | pass | test | Specs/docs updated; `pnpm --dir plugin run schemas:check` and `pnpm --dir plugin run typecheck` passed. |
| C1 | constraint | respected | static_check | Runtime code remains TypeScript/Bun-compatible; tests run under Node/Vitest through bin/oc-test and pnpm typecheck. |
| C2 | constraint | respected | static_check | No active state authority moved to disk; benchmark disk mode is explicitly isolated substitute and labeled non-live. |
| C3 | constraint | respected | static_check | Typed unions, search attributes, tests, and specs own new behavior; no heuristic correctness authority introduced. |
| C4 | constraint | respected | static_check | advance-meta and advance-workflow specs/docs updated for changed contracts; schemas:check passed. |
| C5 | constraint | respected | static_check | Reviewer ran workflow boundary/purity/search-attr/query targeted tests; no workflow mutation surface change introduced. |
| C6 | constraint | respected | static_check | Test suites routed through repo-local `bin/oc-test targeted`; direct pnpm used for schemas/typecheck/bench scripts only. |
| C7 | constraint | respected | static_check | Summary fast paths limited to orientation/diagnostics; gates/archive/recovery/task mutation code paths unchanged. |
| DONT1 | avoidance | respected | review | Temporal backend retained; no replacement runtime introduced. |
| DONT2 | avoidance | respected | review | Changes scoped to status/test/Visibility/benchmark/spec docs; no broad storage/workflow rewrite. |
| DONT3 | avoidance | respected | review | adv_run_test durable recording preserved with explicit degradation; mutation cache discipline not changed. |
| DONT4 | avoidance | respected | review | Only implicated ADV latency surfaces touched. |
| DONT5 | avoidance | respected | review | Probe stale output remains freshness metadata; no recovery/archive/unlock/mutation path consumes it as authority. |
| DONT6 | avoidance | respected | review | No change-workflow mutation helper bypass added; adv_run_test signal exemption remains documented and non-read-after-signal. |
| DONT7 | avoidance | respected | review | test.test covers degraded timeout/signal_failed and not_applicable/recorded statuses; failure no longer swallowed silently. |
| DONT8 | avoidance | respected | review | Visibility project scope uses typed registered AdvAffectedProjects; tests assert no AdvProjectId filter/export dependency. |
| DONT9 | avoidance | respected | review | Benchmark evidence recorded in task verification; no live Temporal numbers claimed without live mode. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Not implemented. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Not implemented. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Not implemented. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Not implemented. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Not implemented. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8db3db642aee | AC8 | AC8 | C4, DONT5, DONT7, DONT9 |  |
| tk-8aeb1c7da539 | AC3, SC4 | AC3 | DONT5, C7 |  |
| tk-825260b40254 | AC5, SC4 | AC5 | DONT7, C5 |  |
| tk-eb238e2fd340 | AC4 | AC4 | C2, C7, DONT8, OOS3 |  |
| tk-607e1aa238c5 | AC1, AC2, SC1, SC2 | AC1, AC2 | AC4, C7, DONT5 |  |
| tk-81d5dde34e26 | AC6, SC2, SC5 | AC6, SC5 | DONT9 |  |
| tk-9392fc69fbfb | SC3 | SC1, SC2, SC3, SC4, SC5, AC7, AC8 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8, DONT9 |  |
