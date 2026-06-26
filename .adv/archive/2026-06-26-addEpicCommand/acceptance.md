# Acceptance

Reviewed at: 2026-06-26T18:40:45.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Users can invoke `/adv-epic` to create an Epic through one collaborative, goal-first workflow. | pass | `/adv-epic` command file exists and is registered in manifest/docs. Reviewer verdict READY; targeted test suite passed 100 tests. |
| SC2 | success_criterion | Epic creation never proceeds until the user has confirmed the Epic's ultimate goal. | pass | `.opencode/command/adv-epic.md` requires explicit Ultimate Goal confirmation before create/update mutation. |
| SC3 | success_criterion | Overlapping open Epics/changes/backlog work are surfaced before mutation, with neutral evidence and explicit user choice. | pass | Command contract requires related-work scan and overlap decision before mutation; asset tests cover overlap handling. |
| SC4 | success_criterion | Valid Epics can be created with zero initial roadmap entries. | pass | Command contract states initial entries are optional and `adv_epic_create` may run without shell/change entries. |
| AC1 | acceptance_criterion | `.opencode/command/adv-epic.md` exists with frontmatter `name: adv-epic`, exact manifest-matching description, and `requiresChangeId: false`. | pass | `.opencode/command/adv-epic.md` frontmatter includes `name: adv-epic`, `description: Gather Epic goals before typed creation`, and `requiresChangeId: false`; `advance-epics-assets.test.ts` asserts these; targeted suite passed. |
| AC2 | acceptance_criterion | `plugin/src/manifest.ts` registers `adv-epic` as no-gate, `requiresChangeId: false`, `phase: "utility"` or equivalent no-gate initiative-planning phase. | pass | `plugin/src/manifest.ts` registers `adv-epic` with `requiresChangeId:false`, no gate, and `phase:"pre-implementation"`; manifest tests passed. |
| AC3 | acceptance_criterion | `/adv-epic` command contract requires an explicit `Ultimate Goal` before Epic creation mutation may run. | pass | Command contract includes explicit Ultimate Goal checkpoint before any Epic mutation; asset tests passed. |
| AC4 | acceptance_criterion | `/adv-epic` command contract requires related-work checks using Epic/change/backlog reads before creation. | pass | Command contract requires `adv_epic_list`/`adv_epic_show`, `adv_change_list`, and backlog read before creation; asset tests passed. |
| AC5 | acceptance_criterion | If plausible overlap exists, command asks user to choose update/clarify existing vs create new before mutation. | pass | Command contract requires user choice to update/clarify existing vs create new when plausible overlap exists; asset tests passed. |
| AC6 | acceptance_criterion | Command contract states initial shell/change entries are optional; shell/link additions use typed Epic tools only. | pass | Command contract states initial shell/change entries are optional and shell/link additions use typed Epic tools only; asset tests passed. |
| AC7 | acceptance_criterion | `advance-epics` spec gains a requirement covering `/adv-epic` goal-first creation and overlap decision behavior. | pass | `advance-epics` spec and markdown mirror add `rq-epicCreateCommand01`; spec/docs asset tests and schemas check passed. |
| AC8 | acceptance_criterion | Tests fail without command/manifest/docs/spec anchors and pass after implementation. | pass | RED/GREEN task evidence recorded for missing command/manifest/docs rows; final targeted suite passed 100 tests after implementation/remediation. |
| C1 | constraint | Do not add `bin/adv epic create` or any CLI mutation verb. | respected | No `bin/adv epic create` or CLI mutation added; CLI surface matrix row is `agent-workflow-only`; CLI matrix test passed. |
| C2 | constraint | Do not add a separate structural `ultimate_goal` field to the Epic schema in this change; encode the ultimate goal in the command-required narrative structure. | respected | No Epic schema field `ultimate_goal` added; goal is encoded in command-required narrative structure. |
| C3 | constraint | Do not make initial roadmap entries mandatory. | respected | Command contract explicitly allows creating Epic with zero initial entries. |
| C4 | constraint | Do not make Epic membership mandatory for all ADV changes. | respected | No change made requiring Epic membership for all ADV changes; existing optional-membership guidance preserved. |
| C5 | constraint | Do not treat Epic order as a gate/task blocker. | respected | No command/spec/doc language makes Epic order a gate or task blocker; existing advisory-order guidance preserved. |
| C6 | constraint | Do not bypass typed Epic MCP tools or read ADV state files directly. | respected | Command contract uses typed Epic MCP tools for mutations and typed reads for state; no direct ADV state file reads introduced. |
| C7 | constraint | Keep overlap detection evidence-backed: typed Epic/change/backlog reads plus user confirmation; heuristics may only rank/summarize evidence. | respected | Overlap scan is evidence-backed via typed Epic/change/backlog reads; command text treats heuristics as neutral summarization/ranking only. |
| OOS1 | out_of_scope | CLI mutation command such as `bin/adv epic create`. | respected | No CLI mutation command added; CLI surface matrix remains agent-workflow-only for `/adv-epic`. |
| OOS2 | out_of_scope | Epic schema migration for a new `ultimate_goal` field. | respected | No Epic schema migration for `ultimate_goal`. |
| OOS3 | out_of_scope | Mandatory shell/change entries at Epic creation time. | respected | Command allows zero initial entries and does not require shell/change entries. |
| OOS4 | out_of_scope | Jira-like assignee, estimate, sprint, board, or ownership workflows. | respected | No assignee/estimate/sprint/board/ownership workflow fields or docs added. |
| OOS5 | out_of_scope | Automatic implementation change/task creation from every shell entry. | respected | No automatic implementation change/task creation from shell entries added. |
| OOS6 | out_of_scope | Fixing the pre-existing Epic tool warrant-surface omission; tracked separately as agenda `ag-Adj91lPD`. | respected | Epic tool warrant-surface omission remains tracked separately as agenda `ag-Adj91lPD`; this change avoided requiring that fix. |
| DONT1 | avoidance | Do not create a new Epic when a clearly overlapping open Epic exists without asking the user to choose update/clarify existing vs create new. | respected | Command contract requires overlap decision before creating a new Epic when plausible existing open work overlaps. |
| DONT2 | avoidance | Do not present neutral overlap evidence as a hidden recommendation; user chose neutral evidence, not a default recommendation. | respected | Command contract presents overlap evidence neutrally and asks user to choose; no default recommendation encoded. |
| DONT3 | avoidance | Do not weaken existing product/cross-project Epic guidance. | respected | Product/cross-project Epic guidance in ADV_INSTRUCTIONS remains present; `/adv-epic` row only adds command surface. |
| DONT4 | avoidance | Do not complete discovery based on archived-change scan success; archived scan degraded due `adv_change_list includeArchived:true` timeout and is not required for this scope. | respected | Discovery degraded archived-change scan was not used as completion proof; implementation scope relies on active typed reads/command contract/tests. |

