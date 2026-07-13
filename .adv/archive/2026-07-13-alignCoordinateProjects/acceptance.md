# Acceptance

Reviewed at: 2026-07-13T01:39:59.087Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1:** When `/adv-coordinate` runs for a participating project, its Phase 1 inventory names `adv_change_list` and records that project's in-flight changes before Phase 4 alignment conclusions. | pass | `bin/oc-test targeted -- src/advance-epics-assets.test.ts -t adv-coordinate` passed: 16 assertions; command Phase 1 requires typed adv_change_list complete pagination before Epic-dependent alignment. |
| AC2 | acceptance_criterion | **AC2:** When a project is product-linked or a cross-project target is participating, the command specifies the typed `scope: "product"` or `target_path` read needed to inventory that project's changes; no filesystem ADV-state read is specified. | pass | Same 16 passing command/spec assertions cover typed scope:"product", explicit target_path, no inferred paths, and degraded context labels. |
| AC3 | acceptance_criterion | **AC3:** The coordination report inventory contains explicit rows for `Projects scanned`, `Changes by project`, `Epics scanned`, and `entries scanned`. | pass | Same 16 passing assertions cover Phase 7 and Final Report rows: Projects scanned, Changes by project, Epics scanned, entries scanned. |
| AC4 | acceptance_criterion | **AC4:** Alignment findings classify each change-related conclusion as one of `repo_backed_fact`, `adv-backed-fact`, `judgment_call`, or `freshness_limited`; an Epic entry order finding remains advisory and cannot block a change gate, task, promotion, or progress. | pass | Passing command/spec assertions cover evidence-label spelling by consumer and preserve advisory order/no-mutation boundary. |
| AC5 | acceptance_criterion | **AC5:** A project with zero active Epics still produces a complete project-change coordination report and the explicit observation `No active Epics`; it does not stop before reporting project changes. | pass | Passing ordering assertion verifies No active Epics occurs after project-change inventory. |
| AC6 | acceptance_criterion | **AC6:** Focused automated tests assert all four paths: project-only, Epic-linked, no-active-Epic, and multi-project/product or target-path coordination. | pass | Focused adv-coordinate filter passed 16 assertions covering project inventory, Epic-linked context, no-active-Epic ordering, and product/target-path behavior. |
| C1 | constraint | **C1:** Reuse typed `adv_change_list` for inventory and `adv_change_show` only for required detail; reuse `adv_epic_list` and `adv_epic_show` for Epics. | respected | Reviewed diff uses existing adv_change_list/adv_change_show/adv_epic_list/adv_epic_show names in command prose; no tool implementation changed. |
| C2 | constraint | **C2:** Do not introduce a new coordination aggregation tool, a CLI mutation verb, direct ADV-state filesystem access, mandatory Epic membership, or automatic enrollment. | respected | Manifest scope remains read-only for adv-coordinate; reviewer READY report confirms no new runtime tool, CLI mutation, direct state access, mandatory membership, or auto-enrollment. |
| C3 | constraint | **C3:** Durable Epic mutations remain explicit-user-approved and use existing typed Epic tools. | respected | Review confirms existing approval-gated typed Epic mutation instructions remain unchanged. |
| C4 | constraint | **C4:** Repository freshness restrictions and evidence labels already required by the Epic coordination law remain unchanged. | respected | Review confirms repository freshness and four-label evidence requirements remain present; product-context degradation is explicitly constrained. |
| OOS1 | out_of_scope | **OOS1:** Changing Epic entity schemas, membership semantics, or one-Epic-per-change invariant. | not_applicable | No Epic entity schema, membership semantic, or one-Epic-per-change change was made. |
| OOS2 | out_of_scope | **OOS2:** Implementing new durable coordination mutations. | not_applicable | No durable coordination mutation implementation was added. |
| OOS3 | out_of_scope | **OOS3:** Changing repository freshness mechanics beyond adapting report coverage to project-change findings. | not_applicable | Repository freshness mechanics were not changed; only report coverage was extended. |

