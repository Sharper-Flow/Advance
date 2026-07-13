# Contract Traceability

**Change ID:** alignProviderEvalTargets
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T03:48:13.976Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | provider-eval.ts PROVIDERS uses canonical OpenRouter slugs; bun test scripts/provider-eval.test.ts 8/8 (tr_mriog0jc). |
| SC2 | success_criterion | pass | review | Four prompt YAMLs relabeled to selected models; provider-eval.test.ts asserts prompt_files preserved; diff shows only notes labels changed. |
| SC3 | success_criterion | pass | review | tool-arg-preflight.test.ts regression matrix: strict-mode blank/zero placeholders normalize; required audit/approval/identity/command/content fields still reject blanks (tr_mriog254). |
| SC4 | success_criterion | pass | review | Global schema-backed coverage guard recorded RED tr_mrinvh8y (exit 1, surfaced 4 uncovered fields) then GREEN tr_mrioetbr after coverage completed. |
| AC1 | acceptance_criterion | pass | test | provider-eval.test.ts asserts exact pairs: openai/gpt-5.6-terra/GPT-5.6 Terra; z-ai/glm-5.2/GLM-5.2; moonshotai/kimi-k2.7-code/Kimi K2.7 Code; anthropic/claude-opus-4.8/Claude Opus 4.8. 8/8. |
| AC2 | acceptance_criterion | pass | test | Diff shows only notes selected-model labels updated; prompt IDs/targets/expected+forbidden patterns unchanged; provider-eval.test.ts asserts prompt_files preserved. |
| AC3 | acceptance_criterion | pass | test | FIELD_POLICIES now covers 19 groups incl. adv_backlog_list.tail_limit, adv_epic_list.limit, adv_project_wisdom_list.maxEntries, adv_reflection_list.maxEntries; coverage guard passes (tr_mrioetbr). |
| AC4 | acceptance_criterion | pass | test | Regression matrix includes non-zero preservation cases (tail_limit 500, limit 25, maxEntries 10/8) and required-field blank-rejection controls; 100/100 preflight tests. |
| AC5 | acceptance_criterion | pass | test | Guard scans registered top-level args via schema safeParse (no regex), excludes nested report; no nested-report policy added; drift guard test confirms live-arg references. |
| AC6 | acceptance_criterion | pass | test | provider-eval.ts validates PROVIDERS config before any OpenRouter network call; guard/tests are read-only; no remote mutation occurs during verification. |
| C1 | constraint | respected | static_check | All four model_ids are concrete dotted OpenRouter slugs; no latest aliases in diff. |
| C2 | constraint | respected | static_check | hint_file and prompt_files unchanged in diff; provider-eval.test.ts asserts hint/prompt mappings preserved. |
| C3 | constraint | respected | static_check | All additions are top-level FIELD_POLICIES table entries; no nested traversal; guard is top-level schema scan. |
| C4 | constraint | respected | static_check | Diff touches only provider-eval.ts, prompt YAMLs, and tool-arg-preflight.{ts,test.ts}; no live routing config, provider-hint files, or Caveman config changed. |
| DONT1 | avoidance | respected | review | No required audit/approval/identity/command/content field flipped to omit; blank-still-rejects controls pass; only optional fields added. |
| DONT2 | avoidance | respected | review | No policy added for adv_subagent_report_submit.report; guard explicitly excludes nested report payloads. |
| DONT3 | avoidance | respected | review | provider-eval.test.ts 'no second GPT target exists' passes; single gpt entry in PROVIDERS. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a2890b25108e | SC1, SC2, AC1, AC2 | AC1, AC2 | C1, C2, C4, DONT3 |  |
| tk-2b89b9cf3042 | SC3, AC3 | AC3, AC4, AC5 | C3, DONT1, DONT2 |  |
| tk-6ff82311335f | SC4 | SC4, AC4 | C3, DONT1, DONT2 |  |
| tk-88c68912b848 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
