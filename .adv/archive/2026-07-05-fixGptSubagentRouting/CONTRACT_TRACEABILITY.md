# Contract Traceability

**Change ID:** fixGptSubagentRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-04T19:11:15.115Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | GPT provider hint updated in toolbox gpt.md with cross-gate/multi-file/cross-cutting worker guidance; reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Toolbox provider-hints tests now assert GPT apply-task cue, cross-gate/research cue, and no primary/phantom routing; npm test passed 21 tests. |
| SC3 | success_criterion | pass | review | Advance formatter/task tests verify bounded delegation_hint/frontend metadata projection; targeted tests passed 216 tests. |
| SC4 | success_criterion | pass | review | Final verification task and acceptance notes state live OpenCode behavior requires provider-hint deploy + restart/fresh session before runtime claim. |
| AC1 | acceptance_criterion | pass | test | Toolbox gpt.md updated with GLM-parity baseline and main-orchestrator authority boundary; toolbox npm test passed 21 tests after assertions. |
| AC2 | acceptance_criterion | pass | test | test/plugin.test.js includes GPT content assertions for apply cue, cross-gate/research cue, and forbidden primary/phantom routing; npm test passed 21 tests. |
| AC3 | acceptance_criterion | pass | test | tool-formatters/task tests verify formatted ready output exposes delegation_hint/frontend when present; bin/oc-test targeted suite passed 216 tests. |
| AC4 | acceptance_criterion | pass | test | Task tests verify raw ready[] compatibility and missing metadata clean formatting; bin/oc-test targeted suite passed 216 tests. |
| AC5 | acceptance_criterion | pass | test | Content edits in toolbox are limited to providers/gpt.md and tests; non-GPT provider hints unchanged. |
| AC6 | acceptance_criterion | pass | test | Advance verification passed: bin/oc-test targeted suite 216 tests and pnpm run check. Toolbox verification passed: npm test 21 tests. |
| AC7 | acceptance_criterion | pass | test | Verification task explicitly records live OpenCode behavior not verified in-session; provider-hint deploy + OpenCode restart/fresh session required. |
| C1 | constraint | respected | static_check | delegation-defaults spec updated and tests added; no prose-only durable invariant. |
| C2 | constraint | respected | static_check | provider-hints plugin mapping remains structured providerID-based; plugin.js not changed to free-text guessing. |
| C3 | constraint | respected | static_check | Provider-hint test forbids primary/phantom routing; existing worker roster preserved; no new worker contract introduced. |
| C4 | constraint | respected | static_check | Advance work used ADV worktree change/fixGptSubagentRouting; toolbox work used ad-hoc worktree fix/gpt-subagent-routing. |
| C5 | constraint | respected | static_check | Provider content edit is GPT-only; non-GPT hints audited but not modified. |
| DONT1 | avoidance | respected | review | No new sub-agent identities added; changes use existing adv-researcher/adv-engineer terms only. |
| DONT2 | avoidance | respected | review | Tests forbid primary/phantom routing; GPT hint does not route adv/plan/build as sub-agents. |
| DONT3 | avoidance | respected | review | GPT hint explicitly keeps task/gate/archive/release authority with main orchestrator. |
| DONT4 | avoidance | respected | review | Design and implementation add guidance/metadata visibility only; no runtime auto-spawn enforcement added. |
| DONT5 | avoidance | respected | review | No provider-specific ADV runtime agents added or revived. |
| DONT6 | avoidance | respected | review | Runtime behavior not claimed as live-verified; deploy/restart requirement recorded. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No new sub-agent identities created; out of scope respected. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Nested sub-agent depth policy unchanged. |
| OOS3 | out_of_scope | not_applicable | not_applicable | ADV gate lifecycle unchanged. |
| OOS4 | out_of_scope | not_applicable | not_applicable | OpenCode model routing defaults unchanged. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Non-GPT provider hint content not edited. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3ca8a49c7d71 | AC1, AC2, C1, C3 | AC2 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-002ea224b1d4 | AC3, AC4, SC3 | AC3, AC4 | C3, DONT3, DONT4 |  |
| tk-b3b611916649 | SC1, SC2 | AC1, SC1 | DONT4 |  |
| tk-022eb5d04a93 | AC1, AC2, AC5, AC6, SC1, SC2 | AC1, AC2 | C2, C3, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS5 |  |
| tk-6ba0eb8edd5e | AC6, AC7, SC4 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, SC1, SC2, SC3, SC4 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
