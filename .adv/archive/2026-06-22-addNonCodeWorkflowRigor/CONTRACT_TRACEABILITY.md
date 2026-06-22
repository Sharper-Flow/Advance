# Contract Traceability

**Change ID:** addNonCodeWorkflowRigor
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-22T03:13:59.281Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | READY review verified routing in ADV_INSTRUCTIONS.md and .opencode/agents/adv.md: large non-code deliverables route to tracked ADV changes unless one-off/read-only. |
| SC2 | success_criterion | pass | review | READY review verified structural task type/evidence_policy support in plugin/src/types/tasks.ts, plugin/src/tools/task.ts, plugin/src/types/evidence-policy.ts, and validators; not title-only inference. |
| SC3 | success_criterion | pass | review | READY review verified prep/review and validator support for source_citation, source_audit, rubric_review, stakeholder_acceptance, and artifact_reference evidence modes. |
| SC4 | success_criterion | pass | review | READY review verified .opencode/command/adv-improve.md remains no-state-mutation and hands research packs to proposal/discovery; adv-improve asset tests cover this. |
| SC5 | success_criterion | pass | review | READY review verified regression/asset tests plus full validation: pnpm run check tr_mqomtrp2_c527ea2a; ../bin/oc-test full tr_mqomvkwc_c4c1c576; AC regression tr_mqoms2s3_19bbe893. |
| AC1 | acceptance_criterion | pass | test | adv-improve asset coverage passed in targeted AC regression run tr_mqoms2s3_19bbe893; review verified command docs state research packs feed proposal/discovery and no adv_change_create/task_add/gate_complete replacement path. |
| AC2 | acceptance_criterion | pass | test | adv-instructions asset coverage passed in run tr_mqoms2s3_19bbe893; review verified large non-code deliverable routing names market research, design improvement, competitive research, writing, and analysis/planning examples. |
| AC3 | acceptance_criterion | pass | test | adv-instructions asset coverage passed in run tr_mqoms2s3_19bbe893; review verified tracked-change routing unless explicitly one-off/read-only and adv-improve may precede proposal. |
| AC4 | acceptance_criterion | pass | test | Task/schema targeted tests passed: tr_mqol1jkd_1647182b and AC regression tr_mqoms2s3_19bbe893; review verified TaskType/evidence_policy validates code/docs/research/approval/verification. |
| AC5 | acceptance_criterion | pass | test | Evidence policy schema/tests passed: tr_mqol1jkd_1647182b, tr_mqomcjf2_a0f99537, tr_mqoms2s3_19bbe893; review verified required non-code policies are in shared enum and command/validator surfaces. |
| AC6 | acceptance_criterion | pass | test | Prep assets and prep-readiness tests passed: tr_mqolzb1y_1a53a2db, tr_mqomcjf2_a0f99537, tr_mqoms2s3_19bbe893; review verified no fake TDD and not_applicable rationale enforcement. |
| AC7 | acceptance_criterion | pass | test | Review assets and contract validator tests passed: tr_mqolzb1y_1a53a2db, tr_mqomcjf2_a0f99537, tr_mqoms2s3_19bbe893; review verified review matrix/evidence policy pass/fail guidance. |
| AC8 | acceptance_criterion | pass | test | adv-comp-scan asset test passed in AC regression run tr_mqoms2s3_19bbe893; review verified fallback safety text includes redaction, no confidential data, and public-source boundary. |
| AC9 | acceptance_criterion | pass | test | Spec-law task checkpoint 493510e6550bf624a25f11af8b59f4d4a710f322 changed advance-workflow, adv-prep, tdd-contract, prep-readiness, and subagent-reports specs/docs; JSON parse tr_mqoki7oj_ff2f8c5a and Prettier tr_mqokjekp_9596bb2b passed; review verified coverage. |
| AC10 | acceptance_criterion | pass | test | Regression/asset tests prove AC1-AC8: targeted AC regression run tr_mqoms2s3_19bbe893 passed 198 tests; full validation check tr_mqomtrp2_c527ea2a and full suite tr_mqomvkwc_c4c1c576 passed. |
| C1 | constraint | respected | static_check | Review verified adv-improve remains read-only/docs-pack utility; asset tests and command text preserve no-state-mutation boundary. |
| C2 | constraint | respected | static_check | Review found no parallel gate lifecycle; implementation extends existing ADV gates, task model, validators, and review matrix. |
| C3 | constraint | respected | static_check | Review found no external orchestration framework added; implementation stays in existing ADV TypeScript/plugin command surfaces. |
| C4 | constraint | respected | static_check | Design/task evidence kept scope to non-code workflow rigor and did not duplicate tightenAdvScopeDiscipline mechanisms; no duplicate SoW/reverse-traceability subsystem added. |
| C5 | constraint | respected | static_check | Review verified structural schemas/validators: TaskTypeSchema, evidence_policy enum, prep-readiness validation, and contract coverage enforcement. |
| C6 | constraint | respected | static_check | Review verified non-code tasks use evidence policies and not_applicable rationale rather than forced fake red/green TDD. |
| DONT1 | avoidance | respected | review | Review verified routing distinguishes large/ambiguous non-code deliverables from one-off/read-only tasks and keeps full proposal/discovery/design/prep flow for consequential deliverables. |
| DONT2 | avoidance | respected | review | Review verified explicit task type/evidence_policy field and validators; metadata.tdd_intent is not sole semantic carrier. |
| DONT3 | avoidance | respected | review | Review verified source_citation guidance requires source-quality/audit notes where credibility matters and rejects bare citation lists in prep/review surfaces. |
| DONT4 | avoidance | respected | review | Review verified adv-comp-scan remains research utility/fallback and major competitive-research deliverables route into tracked ADV evidence/acceptance, not metadata-only durable acceptance. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No new external workflow engine was implemented or required. |
| OOS2 | out_of_scope | not_applicable | not_applicable | adv-improve state mutation remained out of scope and was not implemented. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No universal research methodology framework for every domain was implemented. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No rewrite of old changes/tasks was performed. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No repositories outside ADV were changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b7cef90ef441 | AC9 |  | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT4 |  |
| tk-4989abfc0d67 | AC4, AC5 | SC2 | C5, C6, DONT2 |  |
| tk-460b311fe671 | AC1, AC2, AC3, AC8 | SC1, SC4 | C1, C2, C3, DONT1, DONT4 |  |
| tk-7e7356b8172e | AC6, AC7 | SC2, SC3 | C5, C6, DONT2, DONT3 |  |
| tk-6668a79328ec | AC6, AC7 | SC3 | C2, C5, C6, DONT1, DONT3, DONT4 |  |
| tk-d831ba8148a4 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC10, SC1, SC2, SC3, SC4, SC5 | DONT2, DONT3 |  |
| tk-02af760e65a6 |  | AC9, AC10, SC5 | C1, C5, DONT2 |  |
| tk-6c65aec9cbb4 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, SC5 | C1, C5, DONT2 |  |
