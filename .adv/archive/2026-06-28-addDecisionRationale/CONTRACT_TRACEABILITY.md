# Contract Traceability

**Change ID:** addDecisionRationale
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-28T01:49:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer report READY, 0 findings; rationale contract added to user-facing output guidance in docs/command-voice-standard.md and .opencode/agents/adv.md. |
| SC2 | success_criterion | pass | review | tr_mqx4ol8a_64cefcbd passed; routine handoff spine byte-identical baseline test asserts no Decision rationale text in routine spine. |
| SC3 | success_criterion | pass | review | tr_mqx47zml_141282f8 and tr_mqx4ol8a_64cefcbd passed decision-rationale asset checks; no fourth top-level handoff heading introduced. |
| SC4 | success_criterion | pass | review | source-marker parser validates [source:] markers; docs specify alternatives and concrete typed re-evaluation trigger; tests cover field/source/trigger validity. |
| SC5 | success_criterion | pass | review | No added approval prompt found by reviewer; checkpoint-surface drift tests included in tr_mqx47zml_141282f8. |
| AC1 | acceptance_criterion | pass | test | tr_mqx4ol8a_64cefcbd passed; parser rejects extra fields and requires exact four rationale fields; docs place block inside ## Chosen direction. |
| AC2 | acceptance_criterion | pass | test | source-marker tests validate spec/agreement/contract/ADR/path marker forms and reject malformed markers. |
| AC3 | acceptance_criterion | pass | test | Routine handoff byte-identical baseline test added and passed in tr_mqx4ol8a_64cefcbd; baseline length <= original and no Decision rationale text. |
| AC4 | acceptance_criterion | pass | test | advance-workflow spec/docs define default routine and major only by allowlist or ADR rubric; asset tests verify rq-decisionRationale contract presence. |
| AC5 | acceptance_criterion | pass | test | source-marker parser accepts only trigger_kind date|metric|event|state and requires '; concrete condition'; tr_mqx4ol8a_64cefcbd passed. |
| AC6 | acceptance_criterion | pass | test | tr_mqx47zml_141282f8 included checkpoint-surface drift tests; reviewer found no added approval prompt. |
| AC7 | acceptance_criterion | pass | test | No task or review evidence shows mutation/closure/archive of addDecisionRationale2; notes explicitly keep it out of scope. |
| C1 | constraint | respected | static_check | docs/command-voice-standard.md keeps canonical spine and nests rationale inside Chosen direction; asset tests passed. |
| C2 | constraint | respected | static_check | Reviewer report READY; no new prompts/checkpoints/gates found; checkpoint drift tests passed earlier. |
| C3 | constraint | respected | static_check | Routine handoff baseline test passed in tr_mqx4ol8a_64cefcbd. |
| C4 | constraint | respected | static_check | Spec requirement sets default routine; no code changes invert default to major. |
| C5 | constraint | respected | static_check | Parser requires exact fields and source markers; tests reject extra fields and malformed blocks. |
| C6 | constraint | respected | static_check | Parser extracts triggerKind and condition; tests reject missing concrete condition. |
| C7 | constraint | respected | static_check | Implementation references pokeedge origin only as contextual in change metadata; no dependency on missing trackNativeCsr state. |
| DONT1 | avoidance | respected | review | Asset tests verify rationale is not a fourth spine heading; docs state it lives inside Chosen direction. |
| DONT2 | avoidance | respected | review | No new user approval gate added; reviewer READY. |
| DONT3 | avoidance | respected | review | No per-decision prompt added; tests cover checkpoint surfaces. |
| DONT4 | avoidance | respected | review | Rationale guidance is in command voice docs and ADV agent output contract, not only task/tool notes. |
| DONT5 | avoidance | respected | review | Source-marker parser and asset tests provide deterministic checks; heuristics only inform ADR rubric text, not parser correctness. |
| DONT6 | avoidance | respected | review | Task and review notes explicitly did not close/archive addDecisionRationale2. |
| OOS1 | out_of_scope | respected | not_applicable | No monitoring process or trigger evaluator added; only trigger representation/parser. |
| OOS2 | out_of_scope | respected | not_applicable | No new prompt/checkpoint/approval workflow added. |
| OOS3 | out_of_scope | respected | not_applicable | Change confined to this repo's ADV output/spec/test surfaces; no cross-project rationale federation added. |
| OOS4 | out_of_scope | respected | not_applicable | No UI redesign or browser-visible implementation; Preview URL not_applicable. |
| OOS5 | out_of_scope | respected | not_applicable | No archive rewrite or historical artifact migration performed. |
| OOS6 | out_of_scope | respected | not_applicable | No close/archive operation on addDecisionRationale2 was invoked. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-ce0618b0e876 | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, C1, C3, C4, C5, C6 | AC1, AC2, AC3, AC4, AC5 | DONT1, DONT4, DONT5, OOS1, OOS4, OOS5 |  |
| tk-40a8361dcc1a | SC1, SC2, SC3, SC5, AC1, AC3, AC6, C1, C2, C3 | AC3, AC6 | DONT1, DONT2, DONT3, DONT4, OOS2, OOS3, OOS4 |  |
| tk-6d83abdc9253 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5, C6, C7 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
