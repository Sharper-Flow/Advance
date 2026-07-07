# Contract Traceability

**Change ID:** addAdvVerifier
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T05:38:36.135Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review READY. Verify-only burst routing now names `adv-verifier` in ADV_INSTRUCTIONS.md and `.opencode/command/adv-apply.md`; targeted contract suite passed (tr_mra7pq8q_4f8404e). |
| SC2 | success_criterion | pass | review | `adv-verifier` prompt defines bounded output, failure taxonomy, evidence_basis, findings, recommended_next_action, and strict JSON; `plugin/src/adv-verifier-assets.test.ts` passed. |
| SC3 | success_criterion | pass | review | Agent asset disables edit/write/patch/task/question/todowrite/ADV mutation/report-submit tools; reviewer found 0 blockers and praised authority boundaries. |
| SC4 | success_criterion | pass | review | `adv_run_test` remains task-level evidence path and was used for all task verification; `adv-ci-waiter` unchanged for CI/PR polling. No replacement references introduced. |
| AC1 | acceptance_criterion | pass | test | `plugin/src/adv-verifier-assets.test.ts` asserts `.opencode/agents/adv-verifier.md` exists, hidden `mode: subagent`, and blocks edits/nested task/question/todowrite/ADV mutation tools. Passed in tr_mra7pq8q_4f8404e. |
| AC2 | acceptance_criterion | pass | test | `delegation-matrix.test.ts`, `subagent-reports-spec-assets.test.ts`, and `orchestrator-ops-delegation-assets.test.ts` assert `adv-verifier` primary and `general` fallback-only for Verify-Only Burst. Passed in tr_mra7pq8q_4f8404e. |
| AC3 | acceptance_criterion | pass | test | `adv-verifier-assets.test.ts` asserts JSON `agent` is `adv-verification-triage-bundle` and forbids `adv_subagent_report_submit`; `subagent-reports-spec-assets.test.ts` asserts orchestrator-submitted bundle transport. Passed. |
| AC4 | acceptance_criterion | pass | test | `adv-verifier-assets.test.ts` asserts `bin/oc-test targeted`, `bin/oc-test smoke`, `bin/oc-test full`, native-command fallback only when no wrapper/exact command, and chosen-command rationale. Passed. |
| AC5 | acceptance_criterion | pass | test | `adv-verifier-assets.test.ts` asserts SEMANTIC/TRANSIENT/ENVIRONMENTAL/FATAL/UNKNOWN, route_adv_engineer, scope_risk, confidence, and suggested_handoff anchors. Passed. |
| AC6 | acceptance_criterion | pass | test | `adv-verifier-assets.test.ts` asserts exactly one rerun and no flaky/no transient labels without evidence. Passed. |
| AC7 | acceptance_criterion | pass | test | Targeted drift suite passed: verifier asset, subagent reports spec assets, delegation matrix, orchestrator ops delegation, phantom roster — 156 tests, runId tr_mra7pq8q_4f8404e. |
| AC8 | acceptance_criterion | pass | test | Active-source search found no `no spawnable adv-verifier` avoidance to supersede. Design/implementation record carries conditional rationale: permission lock, routing clarity, main-context hygiene; no contradiction remains. |
| C1 | constraint | respected | static_check | `adv_run_test` remains unchanged and was used for RED/GREEN/verify evidence across tasks; no prompt/spec change replaces it. |
| C2 | constraint | respected | static_check | `adv-ci-waiter` remains the CI/PR polling lane; no CI polling behavior moved to `adv-verifier`; agent prompt explicitly says `adv-ci-waiter` owns CI/PR waiting. |
| C3 | constraint | respected | static_check | `adv-verifier` prompt prefers `bin/oc-test targeted|smoke|full`; smoke and targeted verification were run through `bin/oc-test`. |
| C4 | constraint | respected | static_check | Agent asset blocks edit/write/patch/task/question/todowrite/ADV mutation/report-submit tools and states no final acceptance/release conclusions; asset test passed. |
| C5 | constraint | respected | static_check | `adv-verifier` is only a spawn identity. Persisted report identity remains `adv-verification-triage-bundle` in prompt, spec, and tests. |
| C6 | constraint | respected | static_check | `adv-apply.md` and agent prompt keep worker output as evidence only; main ADV wraps/submits bundle and owns routing/user-facing conclusions. |
| C7 | constraint | respected | static_check | Agent prompt requires reporting chosen command and rationale; `adv-verifier-assets.test.ts` asserts both anchors. |
| DONT1 | avoidance | respected | review | `adv_run_test` not replaced; task evidence uses it throughout. |
| DONT2 | avoidance | respected | review | `adv-ci-waiter` not replaced; verifier prompt explicitly defers CI/PR waiting to `adv-ci-waiter`. |
| DONT3 | avoidance | respected | review | `adv-verifier` edit/write/patch tools disabled and prompt says no remediation; reviewer found no blockers. |
| DONT4 | avoidance | respected | review | `adv-verifier` has `adv_subagent_report_submit: false`; prompt says main ADV submits bundle. |
| DONT5 | avoidance | respected | review | No `adv-verifier` persisted report schema/identity was added; bundle identity remains `adv-verification-triage-bundle`. |
| DONT6 | avoidance | respected | review | Prompt allows exactly one rerun only for transient evidence and forbids open-ended rerun loops; no polling loop added. |
| DONT7 | avoidance | respected | review | Prompt and tests require `bin/oc-test` preference; all suite verification used `bin/oc-test`. |
| DONT8 | avoidance | respected | review | Search found no active prior no-spawnable-adv-verifier avoidance. Conditional supersession rationale remains explicit in design and no silent contradiction was introduced. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-148bb463d7f7 | AC1, AC3, AC4, AC5, AC6, C3, C4, C5, C6, C7 | AC1, AC3, AC4, AC5, AC6 | DONT3, DONT4, DONT5, DONT6, DONT7, C1, C2, C3, C4, C5, C6 |  |
| tk-b4993b7e1563 | AC2, AC3, AC5, AC7, SC1, SC2, SC3, C4, C5, C6 | AC2, AC3, AC5, AC7 | DONT4, DONT5, DONT8, C1, C2, C4, C5, C6 |  |
| tk-3c63f8c3a1e2 | AC2, AC4, AC8, SC1, SC2, SC3, SC4, C1, C2, C3, C4, C6, C7 | AC2, AC4, AC8, SC1, SC4 | DONT1, DONT2, DONT4, DONT5, DONT6, DONT7, DONT8, C1, C2, C3, C4, C5, C6 |  |
| tk-35eaa5466085 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, C1, C2, C3, C4, C5, C6, C7 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, DONT8 |  |
