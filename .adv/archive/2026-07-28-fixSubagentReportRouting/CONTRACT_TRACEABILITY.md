# Contract Traceability

**Change ID:** fixSubagentReportRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-28T01:18:13.118Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | AC5 guard reports 0 violations across all 9 lanes (runId tr_ms3yihh9_84e483c3). Every prompt body now names only the supported dispatch route. |
| SC2 | success_criterion | pass | review | Guard test plugin/src/agent-prompt-policy-binding.test.ts — 17 tests pass, binding prose to AGENT_TOOL_POLICY at runtime |
| SC3 | success_criterion | pass | review | Retry amplifier rescoped: ROLE_FIREWALL_BLOCK never retried (adv-engineer.md L276 diff) |
| AC1 | acceptance_criterion | pass | test | 52 violations rewritten to adv_tool_invoke across 8 lanes, 0 remaining (runId tr_ms3yihh9_84e483c3) |
| AC2 | acceptance_criterion | pass | test | git diff trunk...HEAD -- plugin/src/tool-role-policy.ts is empty; tool-role-policy.test.ts 45 tests pass |
| AC3 | acceptance_criterion | pass | test | git diff trunk...HEAD -- plugin/src/tool-role-firewall.ts is empty; fail-closed semantics preserved |
| AC4 | acceptance_criterion | pass | test | adv-engineer.md L276: transport failures retain retry, ROLE_FIREWALL_BLOCK excluded, payload-emission fallback preserved |
| AC5 | acceptance_criterion | pass | test | Grammar documented in test header: strip ADV-GENERATED, strip fences, match adv_[a-z0-9_]+, check allowed/invoke. 17 tests pass |
| AC6 | acceptance_criterion | pass | test | 3 fixtures: true positive flagged, code-fence not flagged, invoke-wrapped not flagged — all pass |
| AC7 | acceptance_criterion | pass | test | 4 pre-rewrite excerpt fixtures pinned in test file. RED run tr_ms3xvg8b_6760b49d captured 8 lanes. Reviewer report READY. |
| AC8 | acceptance_criterion | pass | test | git diff trunk...HEAD grep for ADV-GENERATED marker lines returns empty — regions byte-identical |
| AC9 | acceptance_criterion | pass | test | 62/62 tests pass across 4 suites including tool-role-policy and agent-tool-contracts-assets (runId tr_ms3ylgf7_1b35957a) |
| C1 | constraint | respected | static_check | Only .opencode/agents/adv-*.md source files edited; deployed copies under ~/.config/opencode/ untouched |
| C2 | constraint | respected | static_check | Invoke-routing wording from frontmatter note reused consistently in all rewrites |
| C3 | constraint | respected | static_check | adv-ci-waiter.md not modified; guard verifies 0 ADV tool references (empty allowed set by design) |
| C4 | constraint | respected | static_check | ADV-GENERATED frontmatter regions unchanged — diff grep returns empty |
| C5 | constraint | respected | static_check | Sequencing constraint: this change is ready to merge first, before paired toolbox change cutAdvEngineerTokenBurn |
| C6 | constraint | respected | static_check | Guard + rewrite merge in single PR; AC7 red-run evidence captured pre-merge as pinned fixture, not by merging failing test |
| DONT1 | avoidance | respected | review | AGENT_TOOL_POLICY, TIER_1/2_ALLOWLIST, subAgentUnionAllowlist() unmodified (AC2 empty diff) |
| DONT2 | avoidance | respected | review | tool-role-firewall.ts unmodified (AC3 empty diff) |
| DONT3 | avoidance | respected | review | TIER_1/2/3 classification unchanged — no allowlist modifications |
| DONT4 | avoidance | respected | review | No changes to opencode.jsonc or any config file |
| DONT5 | avoidance | respected | review | Grammar is explicit with 4 documented steps and 3 fixture-backed proofs in the test file |
| DONT6 | avoidance | respected | review | No failing test merged to trunk; red evidence captured as pre-rewrite fixture on branch |
| OOS1 | out_of_scope | not_applicable | not_applicable | slimMutationToolSurface Tier split not modified |
| OOS2 | out_of_scope | not_applicable | not_applicable | opencode.jsonc permission drift owned by cutAdvEngineerTokenBurn in toolbox |
| OOS3 | out_of_scope | not_applicable | not_applicable | No token-efficiency work beyond this defect fix |
| OOS4 | out_of_scope | not_applicable | not_applicable | adv_tool_invoke dispatch behavior unchanged (proven sound at 230/230) |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a7c40ff6debe | SC2 | AC5, AC6 | C4, DONT5 |  |
| tk-8604d28f20e9 |  | AC7 | C6, DONT6 |  |
| tk-dcb1653f6f0e | SC1, SC3 | AC1, AC4, AC8 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-55feae076c68 |  | AC2, AC3, AC9 | DONT1, DONT2, DONT3 |  |
