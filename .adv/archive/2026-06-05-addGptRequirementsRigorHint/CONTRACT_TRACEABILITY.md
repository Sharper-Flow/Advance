# Contract Traceability

**Change ID:** addGptRequirementsRigorHint
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-05T02:34:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | system-block.ts:134-136 and gpt.md:13-15 add GPT-only requirements-rigor directives covering requirements completeness, measurable AC, and material clarification. |
| SC2 | success_criterion | pass | review | system-block.test.ts:347-349 asserts PROVIDER_HINTS.gpt equals readProviderHintSource('gpt'); targeted test passed 128/128. |
| SC3 | success_criterion | pass | review | system-block.test.ts:380-421 byte-pins Claude, GLM, and Kimi runtime/source hints; targeted test passed 128/128. |
| SC4 | success_criterion | pass | review | Provider mapping and hint emission remain unchanged at system-block.ts:169-180 and 259-264; deploy-local.test.ts:431-489 keeps provider_hint metrics coverage. |
| SC5 | success_criterion | pass | review | Task tk-ee1153ff81b1 records pnpm run build passed and scripts/deploy-local.sh --fix passed with restart notice; targeted test rerun passed 128/128. |
| AC1 | acceptance_criterion | pass | test | Diff adds exactly three PROVIDER_HINTS.gpt directives at system-block.ts:134-136; system-block.test.ts:50-54 defines the expected 3-directive set; targeted test passed 128/128. |
| AC2 | acceptance_criterion | pass | test | gpt.md:13-15 contains the same three directives; system-block.test.ts:347-349 enforces source/runtime equality; targeted test passed 128/128. |
| AC3 | acceptance_criterion | pass | test | system-block.test.ts:380-421 byte-pins Claude/GLM/Kimi hints and source markdown; diff touches only gpt.md, system-block.ts, system-block.test.ts; targeted test passed 128/128. |
| AC4 | acceptance_criterion | pass | test | system-block.test.ts:323-345 verifies openai includes all three directives; 365-377 verifies anthropic, unknown, and null exclude them; targeted test passed 128/128. |
| AC5 | acceptance_criterion | pass | test | deploy-local.test.ts:463-488 covers provider_hint metrics; provider-eval.ts:351-353 reports provider_hint without hard cap; diff adds no prompt-size cap; targeted test passed 128/128. |
| AC6 | acceptance_criterion | pass | test | adv_run_test rerun: bin/oc-test targeted -- src/utils/system-block.test.ts src/deploy-local.test.ts passed 128/128. Task evidence records pnpm run build and scripts/deploy-local.sh --fix passed; smoke and full suite passed after rerun. |
| C1 | constraint | respected | static_check | system-block.ts:169-180 maps structured provider ID openai to gpt; no model-version logic introduced; diff only changes gpt provider hint content/tests. |
| C2 | constraint | respected | static_check | Only three lean directives added; wording requires complete/specific/testable, not verbose; no global prompt expansion beyond GPT hint. |
| C3 | constraint | respected | static_check | system-block.ts:259-264 still emits one matching hint and none for unknown/missing IDs; tests at 351-377 cover null/unknown/non-GPT exclusion; provider_hint metrics remain covered. |
| C4 | constraint | respected | static_check | Task tk-ee1153ff81b1 records deploy-local --fix passed and output says restart OpenCode sessions; acceptance caveat preserves cached host-loaded runtime limitation. |
| C5 | constraint | respected | static_check | Directives use outcome-first, measurable acceptance, validation, and narrow material clarification language; design validator cited OpenAI GPT-5.5 guidance and returned pass with non-blocking cautions. |
| C6 | constraint | respected | static_check | Failed full-suite integration timeout was inspected: affected test passed directly and full suite passed on rerun. adv_change_validate strict passed with only expected NO_DELTAS warning; targeted rerun passed 128/128. |
| DONT1 | avoidance | respected | review | git diff trunk...HEAD touches only gpt.md, system-block.ts, and system-block.test.ts; no caveman overlay files changed. |
| DONT2 | avoidance | respected | review | No shared command files changed. Preview URL not_applicable: agreement visual_surface:false and implementation touches prompt/provider-hint/test files only, no browser-visible output. |
| DONT3 | avoidance | respected | review | Claude, GLM, and Kimi provider hints not in diff; byte-pinned source/runtime tests pass. |
| DONT4 | avoidance | respected | review | No hard prompt-size cap added; provider-eval.ts continues reporting provider_hint metrics only; deploy-local metrics tests pass. |
| DONT5 | avoidance | respected | review | No generated provider runtime agents or retired provider variants changed; diff is limited to provider hint source/runtime and tests. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a31c5952eeb7 | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, C1, C2, C3, C5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-ee1153ff81b1 | SC5, C4, C6 | AC3, AC5, AC6, SC5 | C4, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
