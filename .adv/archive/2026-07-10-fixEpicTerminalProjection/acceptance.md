# Acceptance

Reviewed at: 2026-07-10T06:34:20.141Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Terminal Epic entries no longer appear repair-needed after terminal projection succeeds. | pass | Reducer now sets `membership_status:"terminal"` with terminal summary; targeted tests passed 138 tests (`tr_mrek6cze_4fc8a87e`). |
| SC2 | success_criterion | Existing stale terminal entries can be normalized through explicit `sync_child_projection` repair. | pass | `sync_child_projection` terminal repair tests cover existing stale terminal entries; targeted tests passed 138 tests. |
| SC3 | success_criterion | Projection failures remain explicit; display does not hide inconsistent typed state. | pass | Review found display-OK heuristic risk and remediated it: `repaired:true` now requires typed terminal membership; reviewer verdict READY. |
| AC1 | acceptance_criterion | Given `entryTerminalSummary` records `terminal_summary` for a change entry, the Epic entry also records `membership_status: "terminal"`. | pass | `entryTerminalSummary` reducer test asserts archived/closed terminal summary sets `membership_status:"terminal"`; targeted tests passed. |
| AC2 | acceptance_criterion | Given archive fan-out projects terminal state for an Epic-linked change, later Epic display does not show `projection_missing`, `projection_stale`, or repair-needed markers for that terminal entry. | pass | Archive fan-out uses entryTerminalSummary; reducer-level normalization applies to all terminal-summary callers. Targeted reducer tests passed. |
| AC3 | acceptance_criterion | Given `adv_epic_repair_membership mode:"sync_child_projection"` runs for an already-terminal child, it normalizes the Epic entry to terminal membership or surfaces an explicit warning/failure. | pass | `sync_child_projection` repair tests assert normal terminal repair and explicit stale warning/failure path; targeted tests passed. |
| AC4 | acceptance_criterion | Given a terminal projection update cannot make typed Epic state consistent, the result does not report the entry as repaired/OK by display heuristic alone. | pass | Acceptance-review regression covers terminal summary with `membership_status:"linked"`; output returns `repaired:false` with warning despite display member status OK. |
| AC5 | acceptance_criterion | Given direct link of already archived/closed children already works, regression tests preserve that behavior. | pass | Existing direct archived/closed child link behavior remains covered by `src/tools/epic.test.ts`; targeted suite passed. |
| AC6 | acceptance_criterion | Given implementation completes, targeted tests cover reducer/workflow behavior and at least one previously summary-only tool/archive/repair path. | pass | Targeted verification covered reducer/workflow and repair caller path: `bin/oc-test targeted -- src/temporal/epic-state.test.ts src/tools/epic.test.ts` passed 138 tests. |
| C1 | constraint | Preserve `advance-epics` spec law, especially `rq-epicTerminalChildProjection01` and `rq-epicArchiveSync01`. | respected | No spec-law conflict found; `adv_change_validate strict:true` passed with only NO_DELTAS warning. |
| C2 | constraint | Preserve typed Temporal signal/query architecture; do not introduce update-based mutation surfaces. | respected | Implementation stays on existing signal/query reducer/tool surfaces; no update-based mutation surface added. Typecheck passed. |
| C3 | constraint | Preserve one-Epic-per-change and optional Epic membership invariants. | respected | Change only normalizes terminal membership for existing one-Epic-per-change optional membership entries; no membership model expansion. |
| C4 | constraint | Preserve explicit typed failure/warning behavior for projection/update failures. | respected | Explicit warning path preserved and strengthened; stale typed membership returns warning and `repaired:false`. Targeted tests passed. |
| C5 | constraint | Keep correctness structural in typed Epic state, not display heuristics. | respected | Correctness lives in typed Epic state (`membership_status:"terminal"`) and tool output requires typed terminal; targeted tests passed. |
| C6 | constraint | Keep scope current-repo only. | respected | Touched files are current repo only: `plugin/src/temporal/epic-state.ts`, `plugin/src/temporal/epic-state.test.ts`, `plugin/src/tools/epic.ts`, `plugin/src/tools/epic.test.ts`. |
| DONT1 | avoidance | Do not redesign Epic architecture, entry kinds, ordering, product scope, or cross-project owner routing. | respected | No Epic architecture, entry kind, ordering, product scope, or cross-project owner routing redesign performed. |
| DONT2 | avoidance | Do not make Epic membership mandatory or multi-valued. | respected | Epic membership remains optional and single-valued; no mandatory or multi-valued membership added. |
| DONT3 | avoidance | Do not add `AdvEpicScope`, dashboard indexing, or cross-project shell promotion. | respected | No `AdvEpicScope`, dashboard indexing, or cross-project shell promotion added. |
| DONT4 | avoidance | Do not hide real projection/update failures or convert them into silent success. | respected | Projection/update failures remain explicit; stale membership cannot be reported as repaired/OK. Regression test passed. |
| DONT5 | avoidance | Do not add direct ADV state-file reads. | respected | No direct ADV state-file reads introduced. |
| DONT6 | avoidance | Do not merge this focused fix into unrelated performance/adapter refactor work. | respected | No unrelated performance or adapter refactor included; diff limited to Epic reducer/tool tests and helper behavior. |
| DONT7 | avoidance | Do not include the Epic signal-name parity guard unless implementation naturally touches that area and it stays local/cheap. | respected | Epic signal-name parity guard not added because implementation did not naturally touch signal registration. |
| OOS1 | out_of_scope | Full Epic architecture redesign. | respected | No full Epic architecture redesign performed. |
| OOS2 | out_of_scope | Cross-project shell promotion. | respected | No cross-project shell promotion added. |
| OOS3 | out_of_scope | New dashboard/search-attribute surfaces. | respected | No new dashboard/search-attribute surface added. |
| OOS4 | out_of_scope | Broad adapter-surface refactoring. | respected | No broad adapter-surface refactoring performed. |
| OOS5 | out_of_scope | New Epic planning primitives or Jira-like workflow concepts. | respected | No new Epic planning primitives or Jira-like workflow concepts added. |
| OOS6 | out_of_scope | Bulk migration outside explicit `sync_child_projection` repair behavior. | respected | No bulk migration added outside explicit `sync_child_projection` repair behavior. |

