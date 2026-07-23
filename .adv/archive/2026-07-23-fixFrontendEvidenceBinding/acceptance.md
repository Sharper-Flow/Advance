# Acceptance

Reviewed at: 2026-07-23T17:11:04.635Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | A worker following the documented frontend apply packet constructs a valid designer/engineer report that satisfies the same-cycle evidence gate on the first attempt — no guessing at field placement. | pass | adv-designer/engineer/apply docs document canonical apply_context shape; DDC2 drift-guard test reads adv-designer.md snippet and validates against SubagentApplyContextSchema. |
| SC2 | success_criterion | When a report shape is wrong, the error is self-correcting: it names the `apply_context` path and shows a copyable valid example. | pass | Rejection + gate hints name apply_context.implementation_cycle_id with copyable valid example (AC2 tr_mrxoqwwv_3cb19b59, AC3 tr_mrxp4nwj_c23a0bae). |
| SC3 | success_criterion | `rq-delDefaults10` and the code agree structurally on the `apply_context` JSON shape, so the gap cannot silently recur. | pass | Modify delta dl-FixFrontendBind10 pins apply_context shape in rq-delDefaults10; delegation-matrix.test.ts asserts delta + code agree (tr_mrxoy5bw_be614927). |
| AC1 | acceptance_criterion | A designer report with a correctly-nested `apply_context` (matching `implementation_cycle_id` + valid `implementation_provenance`) is accepted by `adv_subagent_report_submit` and satisfies the same-cycle gate, completing the frontend task. | pass | change-state.test.ts AC1 positive gate test: frontend task completes with nested apply_context designer report (tr_mrxpjg4u_ddfe6dce, 206 pass). |
| AC2 | acceptance_criterion | A designer/engineer report carrying a top-level `implementation_cycle_id` (no `apply_context`) is rejected, and the error names `apply_context.implementation_cycle_id` and includes a minimal valid JSON example. | pass | subagent-report.test.ts: top-level implementation_cycle_id rejected INVALID_REPORT with hint (red tr_mrxormmh, green tr_mrxoqwwv_3cb19b59, 121 pass). |
| AC3 | acceptance_criterion | A frontend task whose only accepted designer report lacks `apply_context` fails at `adv_task_checkpoint` with a `TASK_COMPLETION_BLOCKED` message naming the `apply_context` path and example. | pass | change-state.test.ts: frontend task with accepted legacy designer report throws TASK_COMPLETION_BLOCKED naming apply_context path + example (tr_mrxp4nwj_c23a0bae, 82 pass). |
| AC4 | acceptance_criterion | `rq-delDefaults10` carries the `apply_context` JSON shape via a recorded modify delta; spec and code agree. | pass | adv_delta_modify recorded dl-FixFrontendBind10; delegation-matrix.test.ts pins apply_context shape + additivity (tr_mrxoy5bw_be614927). |
| AC5 | acceptance_criterion | An engineer report's `apply_context` is documented and honored symmetrically with the designer path (same-cycle engineer receipt resolves). | pass | subagent-report.test.ts AC5 symmetry: engineer report with nested apply_context accepted, cycle-bound key preserved (tr_mrxpjg4u_ddfe6dce). |
| C1 | constraint | The report schema remains `.strict()`; no relaxation that silently accepts malformed or unbound reports. | respected | SubagentApplyContextSchema + ImplementationProvenanceSchema unchanged (.strict() retained); typecheck clean. |
| C2 | constraint | No breaking change to existing valid report payloads. | respected | Additive only; full suite 7131 pass with 0 regressions; existing report-payload tests green. |
| C3 | constraint | Engineer and designer `apply_context` handling stay consistent. | respected | Engineer + designer paths documented + tested symmetrically; shared buildApplyContextBindingHint; both submit + gate paths covered. |
| C4 | constraint | No coupling to the separate `fixDurableProofFallback` change. | respected | Disjoint from fixDurableProofFallback: no storage/_ledger/durable-proof changes; touched files disjoint. |
| DONT1 | avoidance | Do not accept a top-level `implementation_cycle_id` alias. | respected | Schema unchanged; top-level implementation_cycle_id still rejected (AC2 test confirms). No alias added. |
| DONT2 | avoidance | Do not auto-bind `apply_context` in the orchestrator or submit path. | respected | No orchestrator/submit-path auto-binding; hint is informational message text only, never mutates report state. |
| DONT3 | avoidance | Do not change the same-cycle matching contract or the frontend-requires-designer-evidence rule. | respected | hasMatchingDesignerApplyEvidence/hasMatchingFrontendImplementationReceipt untouched; only message text appended to designer-evidence throw. |
| OOS1 | out_of_scope | Schema alias / top-level `implementation_cycle_id` acceptance. | missing |  |
| OOS2 | out_of_scope | Orchestrator auto-injection of `apply_context`. | missing |  |
| OOS3 | out_of_scope | The `_ledger` legacy placeholder behavior and Temporal worker/health work. | missing |  |

