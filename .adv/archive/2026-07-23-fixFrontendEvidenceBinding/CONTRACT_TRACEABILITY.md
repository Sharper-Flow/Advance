# Contract Traceability

**Change ID:** fixFrontendEvidenceBinding
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T17:11:04.635Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-designer/engineer/apply docs document canonical apply_context shape; DDC2 drift-guard test reads adv-designer.md snippet and validates against SubagentApplyContextSchema. |
| SC2 | success_criterion | pass | review | Rejection + gate hints name apply_context.implementation_cycle_id with copyable valid example (AC2 tr_mrxoqwwv_3cb19b59, AC3 tr_mrxp4nwj_c23a0bae). |
| SC3 | success_criterion | pass | review | Modify delta dl-FixFrontendBind10 pins apply_context shape in rq-delDefaults10; delegation-matrix.test.ts asserts delta + code agree (tr_mrxoy5bw_be614927). |
| AC1 | acceptance_criterion | pass | test | change-state.test.ts AC1 positive gate test: frontend task completes with nested apply_context designer report (tr_mrxpjg4u_ddfe6dce, 206 pass). |
| AC2 | acceptance_criterion | pass | test | subagent-report.test.ts: top-level implementation_cycle_id rejected INVALID_REPORT with hint (red tr_mrxormmh, green tr_mrxoqwwv_3cb19b59, 121 pass). |
| AC3 | acceptance_criterion | pass | test | change-state.test.ts: frontend task with accepted legacy designer report throws TASK_COMPLETION_BLOCKED naming apply_context path + example (tr_mrxp4nwj_c23a0bae, 82 pass). |
| AC4 | acceptance_criterion | pass | test | adv_delta_modify recorded dl-FixFrontendBind10; delegation-matrix.test.ts pins apply_context shape + additivity (tr_mrxoy5bw_be614927). |
| AC5 | acceptance_criterion | pass | test | subagent-report.test.ts AC5 symmetry: engineer report with nested apply_context accepted, cycle-bound key preserved (tr_mrxpjg4u_ddfe6dce). |
| C1 | constraint | respected | static_check | SubagentApplyContextSchema + ImplementationProvenanceSchema unchanged (.strict() retained); typecheck clean. |
| C2 | constraint | respected | static_check | Additive only; full suite 7131 pass with 0 regressions; existing report-payload tests green. |
| C3 | constraint | respected | static_check | Engineer + designer paths documented + tested symmetrically; shared buildApplyContextBindingHint; both submit + gate paths covered. |
| C4 | constraint | respected | static_check | Disjoint from fixDurableProofFallback: no storage/_ledger/durable-proof changes; touched files disjoint. |
| DONT1 | avoidance | respected | review | Schema unchanged; top-level implementation_cycle_id still rejected (AC2 test confirms). No alias added. |
| DONT2 | avoidance | respected | review | No orchestrator/submit-path auto-binding; hint is informational message text only, never mutates report state. |
| DONT3 | avoidance | respected | review | hasMatchingDesignerApplyEvidence/hasMatchingFrontendImplementationReceipt untouched; only message text appended to designer-evidence throw. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c82b58ebd671 | AC4, SC3 | AC4 | DONT3, C2 |  |
| tk-2cc29d1e63fa | AC2, SC2 | AC2 | DONT1, C1 |  |
| tk-fa10ca08576e | SC1, AC1, AC5 |  | C3 |  |
| tk-fd34c8d58530 | AC3, SC2 | AC3 | DONT3 |  |
| tk-5b139a1e129b |  | AC1, AC5, SC1 | C2 |  |
