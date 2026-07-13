# Contract Traceability

**Change ID:** fixEpicTerminalProjection
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-10T06:34:20.141Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reducer now sets `membership_status:"terminal"` with terminal summary; targeted tests passed 138 tests (`tr_mrek6cze_4fc8a87e`). |
| SC2 | success_criterion | pass | review | `sync_child_projection` terminal repair tests cover existing stale terminal entries; targeted tests passed 138 tests. |
| SC3 | success_criterion | pass | review | Review found display-OK heuristic risk and remediated it: `repaired:true` now requires typed terminal membership; reviewer verdict READY. |
| AC1 | acceptance_criterion | pass | test | `entryTerminalSummary` reducer test asserts archived/closed terminal summary sets `membership_status:"terminal"`; targeted tests passed. |
| AC2 | acceptance_criterion | pass | test | Archive fan-out uses entryTerminalSummary; reducer-level normalization applies to all terminal-summary callers. Targeted reducer tests passed. |
| AC3 | acceptance_criterion | pass | test | `sync_child_projection` repair tests assert normal terminal repair and explicit stale warning/failure path; targeted tests passed. |
| AC4 | acceptance_criterion | pass | test | Acceptance-review regression covers terminal summary with `membership_status:"linked"`; output returns `repaired:false` with warning despite display member status OK. |
| AC5 | acceptance_criterion | pass | test | Existing direct archived/closed child link behavior remains covered by `src/tools/epic.test.ts`; targeted suite passed. |
| AC6 | acceptance_criterion | pass | test | Targeted verification covered reducer/workflow and repair caller path: `bin/oc-test targeted -- src/temporal/epic-state.test.ts src/tools/epic.test.ts` passed 138 tests. |
| C1 | constraint | respected | static_check | No spec-law conflict found; `adv_change_validate strict:true` passed with only NO_DELTAS warning. |
| C2 | constraint | respected | static_check | Implementation stays on existing signal/query reducer/tool surfaces; no update-based mutation surface added. Typecheck passed. |
| C3 | constraint | respected | static_check | Change only normalizes terminal membership for existing one-Epic-per-change optional membership entries; no membership model expansion. |
| C4 | constraint | respected | static_check | Explicit warning path preserved and strengthened; stale typed membership returns warning and `repaired:false`. Targeted tests passed. |
| C5 | constraint | respected | static_check | Correctness lives in typed Epic state (`membership_status:"terminal"`) and tool output requires typed terminal; targeted tests passed. |
| C6 | constraint | respected | static_check | Touched files are current repo only: `plugin/src/temporal/epic-state.ts`, `plugin/src/temporal/epic-state.test.ts`, `plugin/src/tools/epic.ts`, `plugin/src/tools/epic.test.ts`. |
| DONT1 | avoidance | respected | review | No Epic architecture, entry kind, ordering, product scope, or cross-project owner routing redesign performed. |
| DONT2 | avoidance | respected | review | Epic membership remains optional and single-valued; no mandatory or multi-valued membership added. |
| DONT3 | avoidance | respected | review | No `AdvEpicScope`, dashboard indexing, or cross-project shell promotion added. |
| DONT4 | avoidance | respected | review | Projection/update failures remain explicit; stale membership cannot be reported as repaired/OK. Regression test passed. |
| DONT5 | avoidance | respected | review | No direct ADV state-file reads introduced. |
| DONT6 | avoidance | respected | review | No unrelated performance or adapter refactor included; diff limited to Epic reducer/tool tests and helper behavior. |
| DONT7 | avoidance | respected | review | Epic signal-name parity guard not added because implementation did not naturally touch signal registration. |
| OOS1 | out_of_scope | respected | not_applicable | No full Epic architecture redesign performed. |
| OOS2 | out_of_scope | respected | not_applicable | No cross-project shell promotion added. |
| OOS3 | out_of_scope | respected | not_applicable | No new dashboard/search-attribute surface added. |
| OOS4 | out_of_scope | respected | not_applicable | No broad adapter-surface refactoring performed. |
| OOS5 | out_of_scope | respected | not_applicable | No new Epic planning primitives or Jira-like workflow concepts added. |
| OOS6 | out_of_scope | respected | not_applicable | No bulk migration added outside explicit `sync_child_projection` repair behavior. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-178aae63de4b | SC1, AC1, C5 | AC1 | C1, C2, C3, C4, DONT1, DONT2, DONT4, DONT5 |  |
| tk-d0ae968b2919 | SC1, SC2, SC3, AC2, AC3, AC4, AC5 | AC2, AC3, AC4, AC5 | C1, C4, C5, DONT1, DONT4, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
| tk-82868dcc7394 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
