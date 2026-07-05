# Acceptance

Reviewed at: 2026-07-05T21:12:16.742Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Project B can orchestrate Project A Epic/change work without switching sessions. | pass | Reviewer READY; owner-routed Epic create/read/update/list and membership routing implemented and covered by targeted tests (252 passed). |
| SC2 | success_criterion | Remote Epic owner and remote child change routing are explicit, typed, and auditable. | pass | Separate epic_owner_target_path and child target_path routing implemented; split contexts and typed errors reviewed. |
| SC3 | success_criterion | No target child change is created when requested parent Epic membership cannot be validated. | pass | Cross-project create seed tests prove missing parent Epic creates no child; adv_run_test tr_mr891kfj_8f21c0b9 passed. |
| SC4 | success_criterion | Existing same-project Epic flows remain valid. | pass | Same-project and legacy child-remote regressions included in epic/change targeted tests; reviewer READY. |
| AC1 | acceptance_criterion | `adv_change_create` with `target_path` and complete Epic seed fields validates routed parent Epic before target child creation; missing/unreachable parent Epic creates no child change. | pass | adv_run_test tr_mr891kfj_8f21c0b9 passed 99 change create tests; red tr_mr891b5w_0a94d867 showed missing behavior before fix. |
| AC2 | acceptance_criterion | Epic tools support explicit separate owner-project and child-project routing for create/read/update/link/move/unlink/repair operations where supported. | pass | adv_run_test tr_mr89kkbz_f9cfa194 passed 90 owner surface tests; tr_mr88kajo_1f127cef passed 172 tool contract/helper tests. |
| AC3 | acceptance_criterion | Link/move/unlink/repair can operate when Epic owner and child change live in different routed ADV projects, with trust confirmation enforced for every untrusted mutated target. | pass | adv_run_test tr_mr8a203u_05809326 passed 78 Epic membership routing tests including split owner/child cases. |
| AC4 | acceptance_criterion | Unsupported routing shapes fail before durable mutation with typed errors naming the owner/child routing problem; no misleading wrong-store `EPIC_NOT_FOUND`. | pass | Typed routing error tests passed in targeted suites; red evidence showed wrong-store EPIC_NOT_FOUND before fix. |
| AC5 | acceptance_criterion | Regression tests cover issue #195: Project B links Project A change to Project A Epic, creates Project A change with Epic seed fields, and supports split owner/child routed membership where declared supported. | pass | adv_run_test tr_mr8a2ps9_d4479a4e passed 5 targeted suites, 252 tests, covering issue #195 regressions. |
| AC6 | acceptance_criterion | Docs/spec guidance describe current supported routing matrix and remove child-only `target_path` ambiguity. | pass | advance-epics asset/spec tests passed in tr_mr8a2ps9_d4479a4e; docs/spec updated with routing matrix. |
| AC7 | acceptance_criterion | Same-project Epic membership, optional membership, one-Epic-per-change, terminal projection, and audited repair behavior remain intact. | pass | Same-project, optional membership, one-Epic-per-change, terminal projection and repair regressions remain green in epic tests. |
| C1 | constraint | Specs are law; `advance-epics` optional membership, one-Epic-per-change, project-aware entry, audited repair, terminal projection, and product scope requirements remain authoritative. | respected | advance-epics spec updated; implementation preserves optional membership and one-Epic-per-change; reviewer READY. |
| C2 | constraint | Correctness must be structural: schemas, typed routing, target store selection, projection state, and regression tests own behavior. | respected | Typed schemas/helpers/errors and tests own routing correctness; no heuristic owner inference used. |
| C3 | constraint | Mutating untrusted owner or child targets must require explicit confirmation evidence before any state mutation. | respected | Owner/child target routing uses withTargetPathStore trust confirmation paths; targeted tests cover trust preflight. |
| C4 | constraint | Temporal-backed target stores and target queue readiness checks must be used for remote mutations. | respected | Remote owner/child mutations route through Temporal-required target store helpers. |
| C5 | constraint | Change-scoped signals/cache refresh must use the store that owns the mutated change. | respected | Change projection writes use resolved child store; Epic owner writes use resolved owner store. |
| C6 | constraint | Unsupported routing shapes must fail before durable mutation. | respected | Unsupported routing shapes return typed errors before durable mutation in tests. |
| C7 | constraint | Tests must use isolated project fixtures, not `/home/jon/dev/pokeedge` or `/home/jon/dev/pokeedge-business`. | respected | Tests use repo fixtures/mocks; no production PokeEdge paths used as fixtures. |
| DONT1 | avoidance | Do not silently drop create-time Epic seed fields. | respected | Cross-project create now forwards epic_membership; no silent drop per tests. |
| DONT2 | avoidance | Do not infer remote owner intent from child-only `target_path` heuristics. | respected | target_path remains child routing; epic_owner_target_path owns remote owner routing. |
| DONT3 | avoidance | Do not mutate current-session-local Epics when explicit routing selects a remote owner project. | respected | Owner-routed tools use ownerStore.store.epics, not current-session store. |
| DONT4 | avoidance | Do not return `EPIC_NOT_FOUND` from a wrong-store lookup as if the requested routed Epic were absent. | respected | Wrong-store EPIC_NOT_FOUND replaced with typed owner/child routing errors where applicable. |
| DONT5 | avoidance | Do not bypass target trust confirmation, queue readiness, audit evidence, or cache refresh invariants. | respected | Target trust confirmation/queue readiness helpers preserved; review found no bypass. |
| DONT6 | avoidance | Do not make Epic membership mandatory or add Jira-like planning primitives. | respected | No Jira-like primitives or mandatory Epic membership added. |
| DONT7 | avoidance | Do not use direct ADV state-file reads or disk-only patches as a workaround. | respected | Implementation uses ADV stores/tools and tests; no direct ADV state-file workaround. |
| OOS1 | out_of_scope | Cleaning up already-created PokeEdge changes such as `planPricingTrust`. | not_applicable | No cleanup of existing PokeEdge changes performed. |
| OOS2 | out_of_scope | Product planning UX redesign beyond routing/schema/docs needed for these tools. | not_applicable | No product planning UX redesign performed beyond docs/tool routing. |
| OOS3 | out_of_scope | Arbitrary many-project graph orchestration beyond explicit Epic owner/child routing. | not_applicable | Implementation limited to explicit owner/child routing, not arbitrary many-project graph orchestration. |
| OOS4 | out_of_scope | Archive/release workflow changes unrelated to Epic membership projection evidence. | not_applicable | Archive/release workflows not changed except existing projection evidence semantics preserved. |

