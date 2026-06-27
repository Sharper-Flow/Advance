# Contract Traceability

**Change ID:** fixEpicProjections
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T19:43:10.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review reports adv-reviewer attempts 1-2 plus scanner bundle show phantom-child Epic entries repaired via typed tools; no direct state-file edits. Source verified by tr_mqwrmq13_97b30e3a and tr_mqwrmxd9_a480e29c. |
| SC2 | success_criterion | pass | review | Audit evidence required by tool-layer guard and tests; blank/omitted evidence rejected. Scanner trace: epic.ts evidence guard and AC5 tests. |
| SC3 | success_criterion | pass | review | Retarget path refreshes reachable child membership; mismatch is refused before parent mutation. Verified by focused tests and review scanners. |
| SC4 | success_criterion | pass | review | adv_epic_link_change rebuilds/retargets parent entry from exact child membership; omitted-entry-id stale-parent case fixed and verified by new test. |
| AC1 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed focused Epic tests. Tests assert remove_stale_entry removes parent without store.changes.get/clearEpicMembership on missing child. |
| AC2 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed focused Epic tests. Reducer/tool tests verify retarget preserves entry_id/order/title and audit fields; retry idempotency fix preserves original audit. |
| AC3 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed focused Epic tests. Mismatched target child membership returns typed mismatch before store.epics.retargetChange. |
| AC4 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed focused Epic tests including new omitted-entry-id stale-parent retarget regression; parent rebuild/retarget occurs instead of CHANGE_ALREADY_IN_EPIC. |
| AC5 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed focused Epic tests. Blank evidence tests for remove_stale_entry and retarget_stale_entry reject before mutation; schema requires min length. |
| AC6 | acceptance_criterion | pass | test | tr_mqwrmq13_97b30e3a passed 117 focused tests including existing mark_target_unreachable and terminal-summary sync coverage. |
| C1 | constraint | respected | static_check | All writes route through Temporal-backed store.epics/store.changes APIs; store-disk retarget throws. No direct ADV state-file edits observed in diff/review. |
| C2 | constraint | respected | static_check | remove_stale_entry branches before stale-child dereference and calls parent unlink only with operator evidence. |
| C3 | constraint | respected | static_check | Retarget path validates target child membership and refreshes membership for reachable child; stale-parent link fallback issue fixed and reverified. |
| C4 | constraint | respected | static_check | Typed Zod signal payloads, reducer state machine, store interface, Temporal signal handler, and focused tests own correctness; no heuristic repair authority used. |
| C5 | constraint | respected | static_check | Child operations route through resolveChildStore/withTargetPathStore; target_path trust fields preserved. Review found no cross-project trust regression. |
| DONT1 | avoidance | respected | review | Retarget requires explicit repair mode or exact child membership/entry repair intent plus audit evidence; no silent unaudited retarget. |
| DONT2 | avoidance | respected | review | Review scanners found no fuzzy/title-similarity or heuristic target inference; title used only from explicit input or target change. |
| DONT3 | avoidance | respected | review | Parent-only removal never loads/mutates missing child; missing child projection is not fabricated. |
| DONT4 | avoidance | respected | review | One-Epic-per-change membership remains a single projection object; mismatched membership refused. No invariant changes in diff. |
| DONT5 | avoidance | respected | review | Existing sync_child_projection/clear_stale_projection/mark_target_unreachable remain and pass focused regression tests. |
| DONT6 | avoidance | respected | review | Diff limited to Epic repair/link/state/store/types/tests; no duplicate/product-scope cleanup absorbed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out of scope by agreement; no unrelated duplicate/product-scope Epic cleanup implemented. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out of scope by agreement; Epic order semantics and one-Epic-per-change invariant unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6d5013d0bddf | AC2, AC3, SC1, SC2 | AC2, AC3 | C1, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-fa2036cc51dd | AC1, AC2, AC3, AC5, SC1, SC2, SC3 | AC1, AC2, AC3, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
| tk-161465ec46e6 | AC4, SC4 | AC4 | C1, C3, C4, DONT1, DONT2, DONT4, DONT5 |  |
| tk-15533bb043cc | C4, C5 | AC6 | DONT6, OOS1, OOS2 |  |
| tk-dccf41ac015c |  | AC1, AC2, AC3, AC4, AC5, AC6, SC1, SC2, SC3, SC4, C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | OOS1, OOS2 |  |
