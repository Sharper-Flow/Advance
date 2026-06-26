# Contract Traceability

**Change ID:** addEpicCommand
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T18:40:45.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | `/adv-epic` command file exists and is registered in manifest/docs. Reviewer verdict READY; targeted test suite passed 100 tests. |
| SC2 | success_criterion | pass | review | `.opencode/command/adv-epic.md` requires explicit Ultimate Goal confirmation before create/update mutation. |
| SC3 | success_criterion | pass | review | Command contract requires related-work scan and overlap decision before mutation; asset tests cover overlap handling. |
| SC4 | success_criterion | pass | review | Command contract states initial entries are optional and `adv_epic_create` may run without shell/change entries. |
| AC1 | acceptance_criterion | pass | test | `.opencode/command/adv-epic.md` frontmatter includes `name: adv-epic`, `description: Gather Epic goals before typed creation`, and `requiresChangeId: false`; `advance-epics-assets.test.ts` asserts these; targeted suite passed. |
| AC2 | acceptance_criterion | pass | test | `plugin/src/manifest.ts` registers `adv-epic` with `requiresChangeId:false`, no gate, and `phase:"pre-implementation"`; manifest tests passed. |
| AC3 | acceptance_criterion | pass | test | Command contract includes explicit Ultimate Goal checkpoint before any Epic mutation; asset tests passed. |
| AC4 | acceptance_criterion | pass | test | Command contract requires `adv_epic_list`/`adv_epic_show`, `adv_change_list`, and backlog read before creation; asset tests passed. |
| AC5 | acceptance_criterion | pass | test | Command contract requires user choice to update/clarify existing vs create new when plausible overlap exists; asset tests passed. |
| AC6 | acceptance_criterion | pass | test | Command contract states initial shell/change entries are optional and shell/link additions use typed Epic tools only; asset tests passed. |
| AC7 | acceptance_criterion | pass | test | `advance-epics` spec and markdown mirror add `rq-epicCreateCommand01`; spec/docs asset tests and schemas check passed. |
| AC8 | acceptance_criterion | pass | test | RED/GREEN task evidence recorded for missing command/manifest/docs rows; final targeted suite passed 100 tests after implementation/remediation. |
| C1 | constraint | respected | static_check | No `bin/adv epic create` or CLI mutation added; CLI surface matrix row is `agent-workflow-only`; CLI matrix test passed. |
| C2 | constraint | respected | static_check | No Epic schema field `ultimate_goal` added; goal is encoded in command-required narrative structure. |
| C3 | constraint | respected | static_check | Command contract explicitly allows creating Epic with zero initial entries. |
| C4 | constraint | respected | static_check | No change made requiring Epic membership for all ADV changes; existing optional-membership guidance preserved. |
| C5 | constraint | respected | static_check | No command/spec/doc language makes Epic order a gate or task blocker; existing advisory-order guidance preserved. |
| C6 | constraint | respected | static_check | Command contract uses typed Epic MCP tools for mutations and typed reads for state; no direct ADV state file reads introduced. |
| C7 | constraint | respected | static_check | Overlap scan is evidence-backed via typed Epic/change/backlog reads; command text treats heuristics as neutral summarization/ranking only. |
| OOS1 | out_of_scope | respected | not_applicable | No CLI mutation command added; CLI surface matrix remains agent-workflow-only for `/adv-epic`. |
| OOS2 | out_of_scope | respected | not_applicable | No Epic schema migration for `ultimate_goal`. |
| OOS3 | out_of_scope | respected | not_applicable | Command allows zero initial entries and does not require shell/change entries. |
| OOS4 | out_of_scope | respected | not_applicable | No assignee/estimate/sprint/board/ownership workflow fields or docs added. |
| OOS5 | out_of_scope | respected | not_applicable | No automatic implementation change/task creation from shell entries added. |
| OOS6 | out_of_scope | respected | not_applicable | Epic tool warrant-surface omission remains tracked separately as agenda `ag-Adj91lPD`; this change avoided requiring that fix. |
| DONT1 | avoidance | respected | review | Command contract requires overlap decision before creating a new Epic when plausible existing open work overlaps. |
| DONT2 | avoidance | respected | review | Command contract presents overlap evidence neutrally and asks user to choose; no default recommendation encoded. |
| DONT3 | avoidance | respected | review | Product/cross-project Epic guidance in ADV_INSTRUCTIONS remains present; `/adv-epic` row only adds command surface. |
| DONT4 | avoidance | respected | review | Discovery degraded archived-change scan was not used as completion proof; implementation scope relies on active typed reads/command contract/tests. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-88ef53afd9ee | SC1, SC2, SC3, SC4, AC1, AC3, AC5, AC6, AC7 | AC1, AC3, AC5, AC6, AC7, AC8 | C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, OOS2, OOS3, OOS4, OOS5 |  |
| tk-3a9f8ecf5f3f | SC1, AC2, AC8 | AC2, AC8 | C1, C4, C5, C6, OOS1, DONT3 |  |
| tk-9ab0dbdcd7b9 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
