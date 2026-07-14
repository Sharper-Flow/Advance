# Contract Traceability

**Change ID:** addSpecDeltaWriter
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-14T04:36:47.015Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv_delta_add tool tests cover valid add deltas for existing and valid-new capability keys; full suite 5185/5185 passed. |
| SC2 | success_criterion | pass | review | Tool/reducer tests reject malformed capability, IDs, missing scenarios, duplicate delta IDs, duplicate requirement IDs, and existing-spec collisions before store mutation. |
| SC3 | success_criterion | pass | review | Temporal signal/store tests cover specDeltaAdded append, state.deltas readback, cache refresh, and deterministic signal rejection. |
| SC4 | success_criterion | pass | review | Archive activity and full-suite coverage verify existing archive delta application; implementation leaves archive writer unchanged and supports valid new capability add shape. |
| SC5 | success_criterion | pass | review | Tool mirrors target confirmation/recovery contract from change mutation tools; poisoned-history disk-projection write is explicitly refused with typed remediation. |
| AC1 | acceptance_criterion | pass | test | spec-delta tool tests prove valid structured add is delegated through store.specDeltas.add and persisted under capability. |
| AC2 | acceptance_criterion | pass | test | Focused tool, reducer, and store tests prove invalid or duplicate input returns refusal before state mutation. |
| AC3 | acceptance_criterion | pass | test | Targeted archive/tool/state suite 76/76 and full suite 5185/5185 passed; archive remains fail-closed. |
| AC4 | acceptance_criterion | pass | test | Tool contract tests cover target-path confirmation requirements and target routing. |
| AC5 | acceptance_criterion | pass | test | Tool tests cover recovery field requirements; normal poisoned-history recovery refuses disk-projection writes without mutating state. |
| C1 | constraint | respected | static_check | DeltaAddSchema, RequirementSchema, and CapabilityKeySchema are reused; no heuristic matching added. |
| C2 | constraint | respected | static_check | Public tool accepts DeltaAdd only; modify/remove/rename remain unexposed. |
| C3 | constraint | respected | static_check | CapabilityKeySchema accepts valid existing or new kebab-case slugs; archive retains new-spec creation path. |
| C4 | constraint | respected | static_check | Tool uses Temporal store specDeltas.add and specDeltaAdded signal; no direct runtime file write path. |
| C5 | constraint | respected | static_check | Archive activities and spec-delta application modules were not modified by this change. |
| C6 | constraint | respected | static_check | Reducer and disk fallback enforce exact duplicate delta and requirement ID rejection; payload has timestamp/actor audit fields. |
| DONT1 | avoidance | respected | review | adv_change_update remains narrative-only; new standalone adv_delta_add owns mutation. |
| DONT2 | avoidance | respected | review | Validation occurs before store mutation; duplicate/replay signal rejections leave delta record unchanged. |
| DONT3 | avoidance | respected | review | Tool mutates change-owned deltas only; archive remains sole global spec writer. |
| DONT4 | avoidance | respected | review | Tool schema is restricted to add-only DeltaAdd; no full CRUD surface was added. |
| DONT5 | avoidance | respected | review | Target confirmation and recovery evidence are structurally required; direct disk recovery is refused. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-add0b451cb34 | SC1, SC3, AC1 |  | C1, C4, C6, DONT2, DONT3 |  |
| tk-dbe87a62be7b | SC1, SC2, SC3, SC5, AC1, AC2, AC4, AC5 |  | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT5 |  |
| tk-35ad732df458 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
