# Acceptance

Reviewed at: 2026-06-26T23:08:18.856Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Users can treat every Epic as product-capable: local vs product-spanning is derived from typed scope, not fixed at creation. | pass | deriveEpicScopeLabel schema tests, adv_epic_show scope_label tests, and command guidance tests passed (tr_mqvikum0_987de5f8, tr_mqviggwk_36414cfc). |
| SC2 | success_criterion | Users can expand an active local Epic into multi-repo/project scope with audit evidence and stale-write protection. | pass | adv_epic_update_scope state/store/tool tests passed, including stale-version and scope-removal guard regressions (tr_mqvhmzr8_cdea0fc1, tr_mqviznj6_0bad76cf). |
| SC3 | success_criterion | Users can merge duplicate active Epics into one survivor without losing entries or creating multiple owning memberships. | pass | adv_epic_merge dry-run/execution/conflict/preflight tests passed; reviewer re-review READY (tr_mqvj5kou_82c08c0b; reviewer attempt 2). |
| SC4 | success_criterion | Legacy/unscoped Epics remain readable and can be backfilled or referenced safely. | pass | Legacy/unscoped schema/rendering preserved and scope_label legacy behavior covered by types/show tests. |
| SC5 | success_criterion | Cross-project trust, target-path confirmation, and projection repair semantics remain intact. | pass | Target confirmation and projection repair/status paths preserved in merge/scope tests and existing Epic repair tests; typecheck passed. |
| AC1 | acceptance_criterion | Epic scope semantics derive local/product-spanning display from typed repo/project scope metadata, while preserving legacy/unscoped readability. | pass | Derived scope label uses repo count, not kind; compact/full rendering includes scope_label; tests passed. |
| AC2 | acceptance_criterion | Active Epics support audited scope mutation with optimistic concurrency; stale expected version returns typed conflict and does not overwrite scope. | pass | Scope mutation uses expectedVersion/idempotent signal/store path; stale versions return typed stale_version. |
| AC3 | acceptance_criterion | Scope mutation cannot silently orphan linked child changes when repos/projects are removed; it must reject, require explicit disposition, or surface typed repair status. | pass | Scope removal rejects linked entries with matching repo_id and legacy linked entries lacking repo attribution. |
| AC4 | acceptance_criterion | Active duplicate Epics can merge into one survivor; unique entries move/copy to survivor and child `epic_membership` projections point to survivor. | pass | Merge moves unique changes through linkChange/setEpicMembership/unlinkChange and copies shells; source finalized after resolved entries. |
| AC5 | acceptance_criterion | Merge conflicts require explicit disposition; implementation must not silently heuristic-dedupe conflicting shell/change entries. | pass | Duplicate changes/entry IDs produce conflicts; unresolved conflicts block mutation; no heuristic title dedupe path added. |
| AC6 | acceptance_criterion | Source Epic after merge remains readable with `merged_into`/survivor pointer and audit evidence; it must not appear as active next work. | pass | Merged source has merged_into pointer, progress.status merged, active_entries 0, next_work []. |
| AC7 | acceptance_criterion | Completed/archived source Epics cannot be merged into active survivors; they may be referenced as historical context only. | pass | Completed/archived/merged source Epics rejected by merge state/tool guards. |
| AC8 | acceptance_criterion | Cross-project merge/scope operations preserve target-path confirmation and typed statuses such as stale projection or target unreachable. | pass | Cross-project target confirmation preflight remains required for target_path entries; projection mismatch preflight avoids partial mutation. |
| AC9 | acceptance_criterion | Specs/docs/command guidance/tests cover scope derivation, scope mutation, merge/supersede, legacy backfill, and conflict behavior. | pass | Spec/docs/command/tests updated for scope derivation, mutable scope, merge, rendering, and guidance. |
| C1 | constraint | Use typed ADV/Epic tools for mutations; do not edit ADV state files directly. | respected | All mutations implemented through typed ADV/Epic tools and workflow signals; no direct ADV state file edits. |
| C2 | constraint | Preserve `epic_membership` as one optional owning membership object on a child change in v1. | respected | Child change epic_membership remains one optional owning object; merge moves projection rather than adding multiple memberships. |
| C3 | constraint | Keep Epic membership optional; non-Epic changes remain valid. | respected | Epic membership remains optional; no mandatory enrollment added. |
| C4 | constraint | Keep Epic order advisory; scope or merge state must not block gates/tasks solely due to order. | respected | Epic order remains advisory; no gate/task blocking based solely on order added. |
| C5 | constraint | Preserve cross-project `target_path` confirmation and repair semantics. | respected | target_path confirmation and repair semantics preserved in tool schemas and merge preflight paths. |
| C6 | constraint | Preserve backcompat for existing repo/product/legacy Epics. | respected | Legacy/unscoped Epics remain parseable/renderable; scope field remains optional. |
| C7 | constraint | Product/local classification must be structural, not narrative-only. | respected | Product/local classification derives from EpicScope repos length via helper and rendering tests. |
| OOS1 | out_of_scope | Multiple owning Epic memberships for one change. | respected | No multiple owning Epic memberships added. |
| OOS2 | out_of_scope | Assignments, estimates, boards, sprints, or ownership workflow features. | respected | No assignments/estimates/boards/sprints/ownership workflows added. |
| OOS3 | out_of_scope | Replacing GitHub Projects or stakeholder intake. | respected | No GitHub Projects or stakeholder intake replacement added. |
| OOS4 | out_of_scope | Making Epic membership mandatory for all changes. | respected | No mandatory Epic membership behavior added. |
| OOS5 | out_of_scope | Blocking work based only on Epic order. | respected | No Epic-order gate/task blocking added. |
| OOS6 | out_of_scope | Broad redesign of ADV gates unrelated to Epic scope or merge behavior. | respected | Changes limited to Epic scope/merge/render/guidance surfaces. |
| OOS7 | out_of_scope | Merging completed or archived source Epics into active survivor Epics; those may be referenced as history only. | respected | Completed/archived source Epics rejected from active merge execution. |
| DONT1 | avoidance | Do not create duplicate repo-local Epics as the required way to share one initiative. | respected | Command guidance prefers scope update/merge before duplicate creation. |
| DONT2 | avoidance | Do not bypass target-path trust rules for cross-project changes. | respected | target_path confirmation preserved; no bypass added. |
| DONT3 | avoidance | Do not encode scope or merge state only in narrative text. | respected | Scope/merge state represented structurally with schemas/signals/progress, not narrative text only. |
| DONT4 | avoidance | Do not silently detach child changes during merge. | respected | Merge preflights child projections and updates memberships before source finalization; regression prevents partial mutation on projection mismatch. |
| DONT5 | avoidance | Do not make product scope a one-way creation-time decision. | respected | Scope can be updated through adv_epic_update_scope after creation. |
| DONT6 | avoidance | Do not silently auto-dedupe conflicting merge entries by heuristic title similarity. | respected | Merge conflict plan uses deterministic duplicate change/entry conflicts and explicit skip dispositions; no title-similarity dedupe. |

