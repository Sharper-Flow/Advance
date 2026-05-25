# Contract Traceability

**Change ID:** fixSubagentPacketDefects
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-25T02:32:05.989Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Passed: src/adv-task-assets.test.ts asserts top-level ADV contains Typed worker packet contract with WORKING DIRECTORY, CHANGE, TASK, ATTEMPT, adv-reviewer PHASE, orchestrator-owned, never ask user, corrected retry, inline fallback. |
| AC2 | acceptance_criterion | pass | test | Passed: src/adv-task-assets.test.ts asserts missing typed-worker packet fields are orchestrator-owned and handled by retry with corrected packet or continue inline, never ask user. |
| AC3 | acceptance_criterion | pass | test | Passed: src/adv-reviewer-asset.test.ts and src/adv-engineer-assets.test.ts assert missing packet identity fields produce packet_defect structured failure and forbid question/ask-orchestrator wording in relevant sections. |
| AC4 | acceptance_criterion | pass | test | RED evidence: focused tests failed before prompt changes because policy/packet_defect wording was absent. GREEN evidence: same tests passed after patch. |
| AC5 | acceptance_criterion | pass | test | Passed: pnpm exec vitest run src/adv-task-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-engineer-assets.test.ts (3 files, 110 tests). Passed: pnpm run check. |
| C1 | constraint | respected | static_check | No changes to plugin/src/types/subagent-reports.ts or adv_subagent_report_submit schemas. |
| C2 | constraint | respected | static_check | No persisted report schema/support added for adv-researcher or adv-tron. |
| C3 | constraint | respected | static_check | Changes limited to ADV prompt policy and asset tests; no delegation routing code changed. |
| DONT1 | avoidance | respected | review | Prompts now explicitly say packet identity values are not user questions; top-level says never ask user for them. |
| DONT2 | avoidance | respected | review | Prompt guidance backed by asset tests in adv-task-assets, adv-reviewer-asset, and adv-engineer-assets. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0d3678a17f9e | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C3, DONT1, DONT2 |  |
| tk-dbecbbe3f54e |  | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, DONT1, DONT2 |  |
