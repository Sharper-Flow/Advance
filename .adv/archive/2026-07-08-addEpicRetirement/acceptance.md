# Acceptance

Reviewed at: 2026-07-08T17:15:45.842Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Completed Epics have explicit, audited retirement; no active work hidden silently. | pass | Review READY after remediation: typed adv_epic_retire path, expected_version/evidence guards, and no automatic hiding/deletion. Reviewer attempts 1-3; final READY. |
| SC2 | success_criterion | Active Epic lists show only Epics that can still guide work. | pass | Default active list is structurally indexed by AdvEpicStatus=active plus ExecutionStatus=Running; reviewer final READY. Full verification tr_mrcc8neq_5dc347fd. |
| SC3 | success_criterion | Retired Epic history remains queryable by typed reads. | pass | Retired projection and adv_epic_show fallback covered by focused tests and prior task evidence; final full suite tr_mrcc8neq_5dc347fd passed. |
| SC4 | success_criterion | Existing completed Epics can be reviewed via dry-run before retirement. | pass | Completed-candidate dry-run/report and explicit legacy status-index repair path implemented with dryRun tests; targeted tr_mrcbrhfk_6ec055f0 passed. |
| AC1 | acceptance_criterion | A completed Epic can be retired through a typed lifecycle path with audit evidence and expected-version protection. | pass | Typed retire path with evidence + expected_version covered by storage/tool/workflow tests; final full suite passed tr_mrcc8neq_5dc347fd. |
| AC2 | acceptance_criterion | Retiring an Epic with any active/future entry fails before mutation and names blocking entries. | pass | Active/future entry retire rejection covered by workflow/store/tool tests naming blockers; targeted tr_mrcbrhfk_6ec055f0 and full tr_mrcc8neq_5dc347fd passed. |
| AC3 | acceptance_criterion | Default `adv_epic_list` excludes retired/merged Epics and does not rely on consumer-side inference. | pass | Default adv_epic_list/CLI active query requires AdvEpicStatus=active and ExecutionStatus=Running; legacy repair path added; reviewer final READY; full tr_mrcc8neq_5dc347fd passed. |
| AC4 | acceptance_criterion | `adv_epic_show` can still read a retired Epic by ID with title, narrative, entries, terminal summaries, and retirement metadata. | pass | adv_epic_show retired projection fallback tests pass in focused/full suites; task checkpoint evidence plus full run tr_mrcc8neq_5dc347fd. |
| AC5 | acceptance_criterion | `adv epic list --json` remains live Temporal-backed and active-only by default. | pass | adv epic list --json remains Temporal Visibility-only, worker-free, and active-only. Reviewer removed disk enrichment; bun test bin/lib/epic-list.test.ts bin/adv.test.ts passed tr_mrcc2k6u_cec4271c. |
| AC6 | acceptance_criterion | Existing completed Epics have a dry-run/report path that lists retirement candidates and blockers without mutating state. | pass | Completed-candidate dry-run/report path plus legacy status-index repair dry-run tested; targeted suite tr_mrcbrhfk_6ec055f0 passed. |
| AC7 | acceptance_criterion | Regression tests cover completed-to-retired, active-retire rejection, active-list exclusion, CLI active-only behavior, retained history access, and existing-completed dry-run. | pass | Regression coverage includes retire success/reject, active list exclusion, CLI behavior, retained history, candidate dry-run, and index repair. Final full suite tr_mrcc8neq_5dc347fd passed. |
| C1 | constraint | Preserve retired Epic audit/history access. | respected | Retired projection read/write and show fallback retained; no deletion path added. Review final READY. |
| C2 | constraint | Keep active listing semantics structural and typed; consumer-side inference is not sufficient. | respected | Active listing semantics centralized in AdvEpicStatus + Temporal Visibility query; explicit repair backfills missing index. Not consumer-side inference. |
| C3 | constraint | Keep Epic order advisory; do not block change gates solely due to Epic ordering. | respected | No gate/order blocking added; Epic order behavior unchanged aside from lifecycle/listing/index repair. |
| C4 | constraint | Use Temporal workflow state/signals as source of truth; do not mutate ADV state files directly. | respected | Retire/index repair use Temporal workflow signals and store methods; agents did not mutate ADV state files directly. |
| C5 | constraint | Do not retire an Epic unless it is completed and has no active/future entries. | respected | Retire preflight/workflow guard requires completed progress and no active/future entries; rejection tests passed. |
| C6 | constraint | Respect existing CLI source-boundary and worker-free CLI constraints. | respected | CLI list reads Temporal Visibility only; disk-backed child enrichment removed by reviewer; bin tests tr_mrcc2k6u_cec4271c passed. |
| C7 | constraint | Support Epic owner routing for retirement surfaces if the tool is owner-scoped like other Epic tools. | respected | Epic owner routing used for retirement and repair surfaces; tool tests cover owner-routed behavior. |
| DONT1 | avoidance | Do not silently delete completed Epics or make history inaccessible. | respected | No silent deletion; retirement persists projection before archive/completion; retained history tests pass. |
| DONT2 | avoidance | Do not rely on every consumer to infer whether a completed Epic is inactive. | respected | Consumers do not infer completion; AdvEpicStatus index owns active/default filtering, with explicit repair for legacy missing index. |
| DONT3 | avoidance | Do not auto-retire existing completed Epics without operator review. | respected | Existing completed Epics are reported via dry-run/candidate path; no automatic retirement added. |
| DONT4 | avoidance | Do not add mandatory Epic membership, Jira-like ownership, sprints, estimates, boards, or assignments. | respected | No Jira-like assignments/boards/sprints/estimates or mandatory Epic membership added. |
| DONT5 | avoidance | Do not broaden into product launcher changes unless a concrete downstream consumer requirement is proven. | respected | No product launcher/API expansion; CLI surface stayed local to existing adv epic list behavior. |
| DONT6 | avoidance | Do not rewrite change archive/release semantics beyond necessary Epic terminal-projection integration evidence. | respected | Change archive/release semantics unchanged except necessary Epic terminal projection/index evidence. |
| OOS1 | out_of_scope | Mandatory Epic membership for all ADV changes. | not_applicable | Out of scope; no mandatory Epic membership introduced. |
| OOS2 | out_of_scope | Jira-like planning primitives. | not_applicable | Out of scope; no Jira-like planning primitives introduced. |
| OOS3 | out_of_scope | Deleting Epic history or removing audit access. | not_applicable | Out of scope; history deletion avoided and typed access preserved. |
| OOS4 | out_of_scope | Broad change archive/release rewrite. | not_applicable | Out of scope; no broad change archive/release rewrite performed. |
| OOS5 | out_of_scope | Product-wide launcher/API changes without proven consumer requirement. | not_applicable | Out of scope; no product-wide launcher/API changes added. |
| OOS6 | out_of_scope | Automatic bulk retirement/backfill of existing completed Epics. | not_applicable | Out of scope; no automatic bulk retirement/backfill of completed Epics. Added explicit audited status-index repair only after user chose Strict + repair. |

