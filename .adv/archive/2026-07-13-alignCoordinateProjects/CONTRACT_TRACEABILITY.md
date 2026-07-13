# Contract Traceability

**Change ID:** alignCoordinateProjects
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T01:39:59.087Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/advance-epics-assets.test.ts -t adv-coordinate` passed: 16 assertions; command Phase 1 requires typed adv_change_list complete pagination before Epic-dependent alignment. |
| AC2 | acceptance_criterion | pass | test | Same 16 passing command/spec assertions cover typed scope:"product", explicit target_path, no inferred paths, and degraded context labels. |
| AC3 | acceptance_criterion | pass | test | Same 16 passing assertions cover Phase 7 and Final Report rows: Projects scanned, Changes by project, Epics scanned, entries scanned. |
| AC4 | acceptance_criterion | pass | test | Passing command/spec assertions cover evidence-label spelling by consumer and preserve advisory order/no-mutation boundary. |
| AC5 | acceptance_criterion | pass | test | Passing ordering assertion verifies No active Epics occurs after project-change inventory. |
| AC6 | acceptance_criterion | pass | test | Focused adv-coordinate filter passed 16 assertions covering project inventory, Epic-linked context, no-active-Epic ordering, and product/target-path behavior. |
| C1 | constraint | respected | static_check | Reviewed diff uses existing adv_change_list/adv_change_show/adv_epic_list/adv_epic_show names in command prose; no tool implementation changed. |
| C2 | constraint | respected | static_check | Manifest scope remains read-only for adv-coordinate; reviewer READY report confirms no new runtime tool, CLI mutation, direct state access, mandatory membership, or auto-enrollment. |
| C3 | constraint | respected | static_check | Review confirms existing approval-gated typed Epic mutation instructions remain unchanged. |
| C4 | constraint | respected | static_check | Review confirms repository freshness and four-label evidence requirements remain present; product-context degradation is explicitly constrained. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No Epic entity schema, membership semantic, or one-Epic-per-change change was made. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No durable coordination mutation implementation was added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Repository freshness mechanics were not changed; only report coverage was extended. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f8596108f315 | AC1, AC2, AC3, AC4, AC5 | AC6 | C1, C2, C3, C4 |  |
