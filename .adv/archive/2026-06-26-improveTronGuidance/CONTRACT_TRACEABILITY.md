# Contract Traceability

**Change ID:** improveTronGuidance
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T19:43:18.190Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts Analysis Startup Sequence, WORKING DIRECTORY, adv_project_context, active ADV state, repo tree/outline across command/agent/skill; targeted test passed. |
| AC2 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts Broad Scan, Scoped Scan, structure map, hotspot/risk scan, dependency/usage trace, active-change/spec overlap, coverage gaps; targeted test passed. |
| AC3 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts routing commands exist and appear across command/agent/skill: /adv-optimizer, /adv-slop-scan, /adv-arch-scan, /adv-proposal, /adv-task, /adv-tron; targeted test passed. |
| AC4 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts combo examples /adv-slop-scan <target> then /adv-optimizer <target> and /adv-arch-scan <target> then /adv-slop-scan <target>; targeted test passed. |
| AC5 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts Unsupported signals and coverage gaps/open questions across command/agent/skill; targeted test passed. |
| AC6 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts no-invocation/no-state/no-edit prose and agent frontmatter denies write, edit, bash, task, adv_change_create, adv_task_add, adv_gate_complete, context7_*, exa_*, webfetch, searchcode_* while allowing adv_subagent_report_submit; targeted test passed. |
| AC7 | acceptance_criterion | pass | test | plugin/src/adv-tron-assets.test.ts asserts Degraded Execution, lgrep, fallback, degraded coverage across command/agent/skill; targeted test passed. |
| AC8 | acceptance_criterion | pass | test | bin/oc-test targeted -- src/adv-tron-assets.test.ts src/optimized-handoff-assets.test.ts src/skill-loading-policy-assets.test.ts passed: 3 test files, 19 tests. |
| AC9 | acceptance_criterion | pass | test | Final verification passed through bin/oc-test targeted -- src/adv-tron-assets.test.ts src/optimized-handoff-assets.test.ts src/skill-loading-policy-assets.test.ts and pnpm run format:check. |
| C1 | constraint | respected | static_check | git diff --name-only trunk...HEAD changed only .opencode/agents/adv-tron.md, .opencode/command/adv-tron.md, plugin/src/adv-tron-assets.test.ts, skills/adv-tron/SKILL.md. |
| C2 | constraint | respected | static_check | adv-tron agent frontmatter still denies mutation/edit/shell/delegation tools and tests assert this; only adv_subagent_report_submit remains allowed. |
| C3 | constraint | respected | static_check | Frontmatter denies context7_*, exa_*, webfetch, searchcode_* and tests assert external research tools remain denied. |
| C4 | constraint | respected | static_check | Work used ADV tools for ADV state and read repo files only; no direct ADV state file reads were used. |
| C5 | constraint | respected | static_check | Guidance caps findings at existing 10 broad / 15 scoped and adds compact matrices/examples rather than full audit workflow. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No /adv-tron dedicated spec created or modified. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No CLI surfaces changed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No agenda auto-creation behavior added; guidance remains suggestions only. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No tests/linters are added to Tron runtime behavior; tests run only during implementation verification. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c5aee02ca5f8 | AC8 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-e17b5ace86e8 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 |  | C1, C2, C3, C4, C5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-2e1144b77b54 |  | AC8, AC9 | C1, C2, C3, C4, C5, OOS1, OOS2, OOS3, OOS4 |  |
