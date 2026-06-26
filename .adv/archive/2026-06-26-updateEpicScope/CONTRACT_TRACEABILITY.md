# Contract Traceability

**Change ID:** updateEpicScope
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T23:08:18.856Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | deriveEpicScopeLabel schema tests, adv_epic_show scope_label tests, and command guidance tests passed (tr_mqvikum0_987de5f8, tr_mqviggwk_36414cfc). |
| SC2 | success_criterion | pass | review | adv_epic_update_scope state/store/tool tests passed, including stale-version and scope-removal guard regressions (tr_mqvhmzr8_cdea0fc1, tr_mqviznj6_0bad76cf). |
| SC3 | success_criterion | pass | review | adv_epic_merge dry-run/execution/conflict/preflight tests passed; reviewer re-review READY (tr_mqvj5kou_82c08c0b; reviewer attempt 2). |
| SC4 | success_criterion | pass | review | Legacy/unscoped schema/rendering preserved and scope_label legacy behavior covered by types/show tests. |
| SC5 | success_criterion | pass | review | Target confirmation and projection repair/status paths preserved in merge/scope tests and existing Epic repair tests; typecheck passed. |
| AC1 | acceptance_criterion | pass | test | Derived scope label uses repo count, not kind; compact/full rendering includes scope_label; tests passed. |
| AC2 | acceptance_criterion | pass | test | Scope mutation uses expectedVersion/idempotent signal/store path; stale versions return typed stale_version. |
| AC3 | acceptance_criterion | pass | test | Scope removal rejects linked entries with matching repo_id and legacy linked entries lacking repo attribution. |
| AC4 | acceptance_criterion | pass | test | Merge moves unique changes through linkChange/setEpicMembership/unlinkChange and copies shells; source finalized after resolved entries. |
| AC5 | acceptance_criterion | pass | test | Duplicate changes/entry IDs produce conflicts; unresolved conflicts block mutation; no heuristic title dedupe path added. |
| AC6 | acceptance_criterion | pass | test | Merged source has merged_into pointer, progress.status merged, active_entries 0, next_work []. |
| AC7 | acceptance_criterion | pass | test | Completed/archived/merged source Epics rejected by merge state/tool guards. |
| AC8 | acceptance_criterion | pass | test | Cross-project target confirmation preflight remains required for target_path entries; projection mismatch preflight avoids partial mutation. |
| AC9 | acceptance_criterion | pass | test | Spec/docs/command/tests updated for scope derivation, mutable scope, merge, rendering, and guidance. |
| C1 | constraint | respected | static_check | All mutations implemented through typed ADV/Epic tools and workflow signals; no direct ADV state file edits. |
| C2 | constraint | respected | static_check | Child change epic_membership remains one optional owning object; merge moves projection rather than adding multiple memberships. |
| C3 | constraint | respected | static_check | Epic membership remains optional; no mandatory enrollment added. |
| C4 | constraint | respected | static_check | Epic order remains advisory; no gate/task blocking based solely on order added. |
| C5 | constraint | respected | static_check | target_path confirmation and repair semantics preserved in tool schemas and merge preflight paths. |
| C6 | constraint | respected | static_check | Legacy/unscoped Epics remain parseable/renderable; scope field remains optional. |
| C7 | constraint | respected | static_check | Product/local classification derives from EpicScope repos length via helper and rendering tests. |
| OOS1 | out_of_scope | respected | not_applicable | No multiple owning Epic memberships added. |
| OOS2 | out_of_scope | respected | not_applicable | No assignments/estimates/boards/sprints/ownership workflows added. |
| OOS3 | out_of_scope | respected | not_applicable | No GitHub Projects or stakeholder intake replacement added. |
| OOS4 | out_of_scope | respected | not_applicable | No mandatory Epic membership behavior added. |
| OOS5 | out_of_scope | respected | not_applicable | No Epic-order gate/task blocking added. |
| OOS6 | out_of_scope | respected | not_applicable | Changes limited to Epic scope/merge/render/guidance surfaces. |
| OOS7 | out_of_scope | respected | not_applicable | Completed/archived source Epics rejected from active merge execution. |
| DONT1 | avoidance | respected | review | Command guidance prefers scope update/merge before duplicate creation. |
| DONT2 | avoidance | respected | review | target_path confirmation preserved; no bypass added. |
| DONT3 | avoidance | respected | review | Scope/merge state represented structurally with schemas/signals/progress, not narrative text only. |
| DONT4 | avoidance | respected | review | Merge preflights child projections and updates memberships before source finalization; regression prevents partial mutation on projection mismatch. |
| DONT5 | avoidance | respected | review | Scope can be updated through adv_epic_update_scope after creation. |
| DONT6 | avoidance | respected | review | Merge conflict plan uses deterministic duplicate change/entry conflicts and explicit skip dispositions; no title-similarity dedupe. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2d2db02bc7ca | SC1, SC4, AC1, AC6, AC9 | SC1, SC4, AC1, AC6, AC9 | C1, C2, C3, C4, C6, C7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7, DONT1, DONT3, DONT5 |  |
| tk-103c24e0769e | SC2, AC2, AC3, AC8 | SC2, AC2, AC3, AC8 | C1, C2, C3, C5, C6, C7, OOS1, OOS2, OOS4, OOS5, OOS6, DONT2, DONT3, DONT4, DONT5 |  |
| tk-b827b5e753be | SC3, SC5, AC4, AC5, AC6, AC7, AC8 | SC3, SC5, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, OOS1, OOS2, OOS4, OOS5, OOS6, OOS7, DONT1, DONT2, DONT3, DONT4, DONT6 |  |
| tk-5c66ac32499b | SC1, SC3, SC4, AC1, AC4, AC6, AC9 | SC1, SC3, SC4, AC1, AC4, AC6, AC9 | C1, C2, C3, C4, C6, C7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7, DONT1, DONT3, DONT5, DONT6 |  |
| tk-ca8bfaef5f3a |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 | C1, C2, C3, C4, C5, C6, C7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-242cb8933399 |  | SC1, SC3, SC4, AC1, AC4, AC6, AC9 | C1, C2, C3, C4, C6, C7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7, DONT1, DONT3, DONT5, DONT6 |  |
