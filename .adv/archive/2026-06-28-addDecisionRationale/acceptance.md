# Acceptance

Reviewed at: 2026-06-28T01:49:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Major ADV decisions expose rationale in the same user-facing output where the decision appears. | pass | Reviewer report READY, 0 findings; rationale contract added to user-facing output guidance in docs/command-voice-standard.md and .opencode/agents/adv.md. |
| SC2 | success_criterion | Routine ADV output remains terse; no rationale text appears unless classification says `major`. | pass | tr_mqx4ol8a_64cefcbd passed; routine handoff spine byte-identical baseline test asserts no Decision rationale text in routine spine. |
| SC3 | success_criterion | Gate Handoff Voice remains valid: `Problem / Chosen direction / Delivered` spine plus blockquote wayfinder. | pass | tr_mqx47zml_141282f8 and tr_mqx4ol8a_64cefcbd passed decision-rationale asset checks; no fourth top-level handoff heading introduced. |
| SC4 | success_criterion | Rationale is audit-ready: source-backed, alternatives visible, re-evaluation trigger concrete. | pass | source-marker parser validates [source:] markers; docs specify alternatives and concrete typed re-evaluation trigger; tests cover field/source/trigger validity. |
| SC5 | success_criterion | No new prompts, checkpoints, or approval gates are introduced. | pass | No added approval prompt found by reviewer; checkpoint-surface drift tests included in tr_mqx47zml_141282f8. |
| AC1 | acceptance_criterion | A major-decision output includes exactly one bounded rationale block inside `## Chosen direction`, with these fields: chosen direction, why it fits, alternatives rejected/deferred, re-evaluation trigger. | pass | tr_mqx4ol8a_64cefcbd passed; parser rejects extra fields and requires exact four rationale fields; docs place block inside ## Chosen direction. |
| AC2 | acceptance_criterion | Every rationale field includes a compact source marker using an artifact path, spec requirement ID, agreement item, contract ID, or ADR reference. | pass | source-marker tests validate spec/agreement/contract/ADR/path marker forms and reject malformed markers. |
| AC3 | acceptance_criterion | Routine decisions emit no rationale block; regression tests prove representative routine handoff output is byte-identical or shorter than baseline. | pass | Routine handoff byte-identical baseline test added and passed in tr_mqx4ol8a_64cefcbd; baseline length <= original and no Decision rationale text. |
| AC4 | acceptance_criterion | Major classification defaults to `routine`; a decision becomes `major` only via an explicit allowlist or the ADR rubric: hard to reverse, surprising without context, and result of a real tradeoff. | pass | advance-workflow spec/docs define default routine and major only by allowlist or ADR rubric; asset tests verify rq-decisionRationale contract presence. |
| AC5 | acceptance_criterion | Re-evaluation trigger is structurally typed as one of: date, metric threshold, named event, or explicit state. | pass | source-marker parser accepts only trigger_kind date|metric|event|state and requires '; concrete condition'; tr_mqx4ol8a_64cefcbd passed. |
| AC6 | acceptance_criterion | Inline approval/checkpoint behavior remains unchanged: no question-tool checkpoint approval and no added approval prompt. | pass | tr_mqx47zml_141282f8 included checkpoint-surface drift tests; reviewer found no added approval prompt. |
| AC7 | acceptance_criterion | `addDecisionRationale2` remains out of scope for this change except as recorded duplicate/conflict context; closing it requires separate explicit approval. | pass | No task or review evidence shows mutation/closure/archive of addDecisionRationale2; notes explicitly keep it out of scope. |
| C1 | constraint | Preserve Gate Handoff Voice structure unless an explicit spec delta updates that structure. | respected | docs/command-voice-standard.md keeps canonical spine and nests rationale inside Chosen direction; asset tests passed. |
| C2 | constraint | Do not add prompts, checkpoints, or approval gates. | respected | Reviewer report READY; no new prompts/checkpoints/gates found; checkpoint drift tests passed earlier. |
| C3 | constraint | Do not add rationale blocks to routine decisions. | respected | Routine handoff baseline test passed in tr_mqx4ol8a_64cefcbd. |
| C4 | constraint | Default classification must be `routine`, not `major`. | respected | Spec requirement sets default routine; no code changes invert default to major. |
| C5 | constraint | Rationale must be bounded and source-backed; it must not become free-form transcript prose. | respected | Parser requires exact fields and source markers; tests reject extra fields and malformed blocks. |
| C6 | constraint | Re-evaluation triggers must be concrete typed conditions, not aspirational text. | respected | Parser extracts triggerKind and condition; tests reject missing concrete condition. |
| C7 | constraint | Treat the `pokeedge` source origin as contextual only because `trackNativeCsr` was not found in target ADV state during discovery. | respected | Implementation references pokeedge origin only as contextual in change metadata; no dependency on missing trackNativeCsr state. |
| DONT1 | avoidance | Do not add a new top-level `## Decision rationale` heading to gate handoff output unless design proves the spec must change. | respected | Asset tests verify rationale is not a fourth spine heading; docs state it lives inside Chosen direction. |
| DONT2 | avoidance | Do not gate decisions behind new user approval. | respected | No new user approval gate added; reviewer READY. |
| DONT3 | avoidance | Do not introduce per-decision prompts. | respected | No per-decision prompt added; tests cover checkpoint surfaces. |
| DONT4 | avoidance | Do not bury rationale only in tool-result transcripts; major-decision rationale must be visible in user-facing output. | respected | Rationale guidance is in command voice docs and ADV agent output contract, not only task/tool notes. |
| DONT5 | avoidance | Do not rely on unconstrained heuristics as correctness authority for persistence, gate completion, or spec compliance. | respected | Source-marker parser and asset tests provide deterministic checks; heuristics only inform ADR rubric text, not parser correctness. |
| DONT6 | avoidance | Do not close or archive duplicate `addDecisionRationale2` inside this change. | respected | Task and review notes explicitly did not close/archive addDecisionRationale2. |
| OOS1 | out_of_scope | Auto-monitoring or auto-evaluation of re-evaluation triggers. | respected | No monitoring process or trigger evaluator added; only trigger representation/parser. |
| OOS2 | out_of_scope | New user prompts, checkpoints, or approval workflows. | respected | No new prompt/checkpoint/approval workflow added. |
| OOS3 | out_of_scope | Cross-project rationale federation beyond this repo's ADV output surfaces. | respected | Change confined to this repo's ADV output/spec/test surfaces; no cross-project rationale federation added. |
| OOS4 | out_of_scope | UI redesign unrelated to the rationale block. | respected | No UI redesign or browser-visible implementation; Preview URL not_applicable. |
| OOS5 | out_of_scope | Retroactively rewriting archived change artifacts. | respected | No archive rewrite or historical artifact migration performed. |
| OOS6 | out_of_scope | Closing `addDecisionRationale2`; that requires separate explicit user approval. | respected | No close/archive operation on addDecisionRationale2 was invoked. |

