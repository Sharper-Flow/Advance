# Contract Traceability

**Change ID:** fixRemoteEpicRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T21:12:16.742Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; owner-routed Epic create/read/update/list and membership routing implemented and covered by targeted tests (252 passed). |
| SC2 | success_criterion | pass | review | Separate epic_owner_target_path and child target_path routing implemented; split contexts and typed errors reviewed. |
| SC3 | success_criterion | pass | review | Cross-project create seed tests prove missing parent Epic creates no child; adv_run_test tr_mr891kfj_8f21c0b9 passed. |
| SC4 | success_criterion | pass | review | Same-project and legacy child-remote regressions included in epic/change targeted tests; reviewer READY. |
| AC1 | acceptance_criterion | pass | test | adv_run_test tr_mr891kfj_8f21c0b9 passed 99 change create tests; red tr_mr891b5w_0a94d867 showed missing behavior before fix. |
| AC2 | acceptance_criterion | pass | test | adv_run_test tr_mr89kkbz_f9cfa194 passed 90 owner surface tests; tr_mr88kajo_1f127cef passed 172 tool contract/helper tests. |
| AC3 | acceptance_criterion | pass | test | adv_run_test tr_mr8a203u_05809326 passed 78 Epic membership routing tests including split owner/child cases. |
| AC4 | acceptance_criterion | pass | test | Typed routing error tests passed in targeted suites; red evidence showed wrong-store EPIC_NOT_FOUND before fix. |
| AC5 | acceptance_criterion | pass | test | adv_run_test tr_mr8a2ps9_d4479a4e passed 5 targeted suites, 252 tests, covering issue #195 regressions. |
| AC6 | acceptance_criterion | pass | test | advance-epics asset/spec tests passed in tr_mr8a2ps9_d4479a4e; docs/spec updated with routing matrix. |
| AC7 | acceptance_criterion | pass | test | Same-project, optional membership, one-Epic-per-change, terminal projection and repair regressions remain green in epic tests. |
| C1 | constraint | respected | static_check | advance-epics spec updated; implementation preserves optional membership and one-Epic-per-change; reviewer READY. |
| C2 | constraint | respected | static_check | Typed schemas/helpers/errors and tests own routing correctness; no heuristic owner inference used. |
| C3 | constraint | respected | static_check | Owner/child target routing uses withTargetPathStore trust confirmation paths; targeted tests cover trust preflight. |
| C4 | constraint | respected | static_check | Remote owner/child mutations route through Temporal-required target store helpers. |
| C5 | constraint | respected | static_check | Change projection writes use resolved child store; Epic owner writes use resolved owner store. |
| C6 | constraint | respected | static_check | Unsupported routing shapes return typed errors before durable mutation in tests. |
| C7 | constraint | respected | static_check | Tests use repo fixtures/mocks; no production PokeEdge paths used as fixtures. |
| DONT1 | avoidance | respected | review | Cross-project create now forwards epic_membership; no silent drop per tests. |
| DONT2 | avoidance | respected | review | target_path remains child routing; epic_owner_target_path owns remote owner routing. |
| DONT3 | avoidance | respected | review | Owner-routed tools use ownerStore.store.epics, not current-session store. |
| DONT4 | avoidance | respected | review | Wrong-store EPIC_NOT_FOUND replaced with typed owner/child routing errors where applicable. |
| DONT5 | avoidance | respected | review | Target trust confirmation/queue readiness helpers preserved; review found no bypass. |
| DONT6 | avoidance | respected | review | No Jira-like primitives or mandatory Epic membership added. |
| DONT7 | avoidance | respected | review | Implementation uses ADV stores/tools and tests; no direct ADV state-file workaround. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No cleanup of existing PokeEdge changes performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No product planning UX redesign performed beyond docs/tool routing. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Implementation limited to explicit owner/child routing, not arbitrary many-project graph orchestration. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Archive/release workflows not changed except existing projection evidence semantics preserved. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-869a82d30278 | AC6 |  | C1, C2, DONT2, DONT6, OOS2, OOS3 |  |
| tk-3bcc1140cc3f | AC2, AC4 | AC2, AC4 | C2, C3, C4, C5, C6, DONT2, DONT3, DONT4, DONT5, DONT7 |  |
| tk-6a480445f23a | SC3, AC1, AC5 | SC3, AC1, AC5 | C2, C3, C4, C5, C6, C7, DONT1, DONT4, DONT5, DONT7, OOS1 |  |
| tk-93f90242b23a | SC1, SC2, AC2, AC5 | SC1, SC2, AC2, AC5 | C1, C2, C3, C4, C6, DONT2, DONT3, DONT5, DONT6, DONT7 |  |
| tk-4940eca6cc6a | SC1, SC2, SC4, AC2, AC3, AC4, AC5, AC7 | SC1, SC2, SC4, AC2, AC3, AC4, AC5, AC7 | C1, C2, C3, C4, C5, C6, C7, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS3 |  |
| tk-3d60b21309eb |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4 |  |
