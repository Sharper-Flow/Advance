# Contract Traceability

**Change ID:** updateEpicArchive
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T21:11:19.206Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer verdict READY; /adv-archive Phase 1 documents `adv_epic_show epic_id:` for `epic_membership`. |
| SC2 | success_criterion | pass | review | `change.archive-phase9.test.ts` passes; archive projection test asserts setEntryTerminalSummary after archive save/release proof. |
| SC3 | success_criterion | pass | review | `epic.test.ts` passes; archived child sync_child_projection backfills terminal summary. |
| SC4 | success_criterion | pass | review | `epic.test.ts` passes; repair reads canonical child state from store and does not call child membership mutation for terminal child. |
| SC5 | success_criterion | pass | review | Command/spec/agent assets include Epic ID/entry/report/repair evidence guidance; asset suite passes. |
| SC6 | success_criterion | pass | review | Existing archive tests pass; non-Epic path unchanged except report guidance allows `Epic: n/a`. |
| AC1 | acceptance_criterion | pass | test | `advance-epics-assets.test.ts` requires adv-archive.md contains `epic_membership` and `adv_epic_show epic_id:`; suite passes. |
| AC2 | acceptance_criterion | pass | test | `change.archive-phase9.test.ts` terminal projection test passes. |
| AC3 | acceptance_criterion | pass | test | Projection path uses idempotent `setEntryTerminalSummary`; archive Phase 9 suite passes on retry-safe behavior. |
| AC4 | acceptance_criterion | pass | test | `epic.test.ts` archived and closed child sync repair tests pass. |
| AC5 | acceptance_criterion | pass | test | Repair uses existing Epic terminal-summary signal; Epic workflow recomputes progress from terminal_summary. Reviewer confirmed path. |
| AC6 | acceptance_criterion | pass | test | All repair/update paths use typed store/Epic APIs; no direct ADV state file reads were added. |
| AC7 | acceptance_criterion | pass | test | adv-archive report template includes `Epic:` line; asset suite passes. |
| AC8 | acceptance_criterion | pass | test | ADV agent and ADV_INSTRUCTIONS include archive/release terminal projection repair/backfill guidance; asset suite passes. |
| AC9 | acceptance_criterion | pass | test | Spec JSON includes `rq-epicArchiveSync01` with future archive, retroactive repair, non-Epic, and advisory-order scenarios. |
| AC10 | acceptance_criterion | pass | test | docs/specs/advance-epics.md includes `rq-epicArchiveSync01`; mirror asset test passes. |
| AC11 | acceptance_criterion | pass | test | RED/GREEN recorded for archive Phase 9, Epic repair, and asset tests; final targeted suite passed 99 tests. |
| C1 | constraint | respected | static_check | No mandatory Epic membership behavior added; non-Epic archive remains valid. |
| C2 | constraint | respected | static_check | Command/spec preserve advisory-order non-blocking language. |
| C3 | constraint | respected | static_check | Implementation uses store/tool APIs only; no direct ADV state file access added. |
| C4 | constraint | respected | static_check | No Jira-like fields/workflows added. |
| C5 | constraint | respected | static_check | Repair/update uses typed Epic signal/store paths. |
| C6 | constraint | respected | static_check | Archive Phase 9 suite passes; release proof ordering preserved. |
| C7 | constraint | respected | static_check | Epic terminal projection is reported as derived planning evidence, not release proof. |
| OOS1 | out_of_scope | respected | not_applicable | No shell promotion/reordering/planning workflow features added. |
| OOS2 | out_of_scope | respected | not_applicable | No cross-project target-path redesign added; existing typed warning/repair surfaces remain. |
| OOS3 | out_of_scope | respected | not_applicable | No one-off repair of the reported external Epic performed. |
| DONT1 | avoidance | respected | review | Archive/release no longer ignores `epic_membership`; command and runtime paths cover it. |
| DONT2 | avoidance | respected | review | Stale projection guidance routes to typed repair/backfill. |
| DONT3 | avoidance | respected | review | Archive Phase 9 tests preserve release proof authority. |
| DONT4 | avoidance | respected | review | `epic.test.ts` proves terminal sync_child_projection reports terminal projection instead of membership-only no-op for archived child. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d2912ef2591a | SC2, AC2 | SC2, AC2 | C1, C2, C3, C5, C6, OOS1, OOS2, OOS3, DONT1, DONT2, DONT3 |  |
| tk-353124fdcc9f | SC1, SC5, AC1, AC6, AC7, AC8, AC9, AC10, AC11 | SC1, SC5, AC1, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4 |  |
| tk-42ff2f9385d8 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3 | C1, C2, C3, C4, C5, C6 |  |
| tk-e2081173496e | SC3, SC4, AC4, AC5 | SC3, SC4, AC4, AC5 | C1, C2, C3, C5, C7, DONT2, DONT4 |  |
| tk-43abd80f168a | SC1, SC5, AC1, AC6, AC7, AC8, AC9, AC10, AC11 | SC1, SC5, AC1, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4 |  |
| tk-8edad6523690 |  | SC1, SC2, SC3, SC4, SC5, SC6, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4 | C1, C2, C3, C4, C5, C6, C7 |  |
