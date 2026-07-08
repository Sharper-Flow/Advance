# Contract Traceability

**Change ID:** addEpicRetirement
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T17:15:45.842Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review READY after remediation: typed adv_epic_retire path, expected_version/evidence guards, and no automatic hiding/deletion. Reviewer attempts 1-3; final READY. |
| SC2 | success_criterion | pass | review | Default active list is structurally indexed by AdvEpicStatus=active plus ExecutionStatus=Running; reviewer final READY. Full verification tr_mrcc8neq_5dc347fd. |
| SC3 | success_criterion | pass | review | Retired projection and adv_epic_show fallback covered by focused tests and prior task evidence; final full suite tr_mrcc8neq_5dc347fd passed. |
| SC4 | success_criterion | pass | review | Completed-candidate dry-run/report and explicit legacy status-index repair path implemented with dryRun tests; targeted tr_mrcbrhfk_6ec055f0 passed. |
| AC1 | acceptance_criterion | pass | test | Typed retire path with evidence + expected_version covered by storage/tool/workflow tests; final full suite passed tr_mrcc8neq_5dc347fd. |
| AC2 | acceptance_criterion | pass | test | Active/future entry retire rejection covered by workflow/store/tool tests naming blockers; targeted tr_mrcbrhfk_6ec055f0 and full tr_mrcc8neq_5dc347fd passed. |
| AC3 | acceptance_criterion | pass | test | Default adv_epic_list/CLI active query requires AdvEpicStatus=active and ExecutionStatus=Running; legacy repair path added; reviewer final READY; full tr_mrcc8neq_5dc347fd passed. |
| AC4 | acceptance_criterion | pass | test | adv_epic_show retired projection fallback tests pass in focused/full suites; task checkpoint evidence plus full run tr_mrcc8neq_5dc347fd. |
| AC5 | acceptance_criterion | pass | test | adv epic list --json remains Temporal Visibility-only, worker-free, and active-only. Reviewer removed disk enrichment; bun test bin/lib/epic-list.test.ts bin/adv.test.ts passed tr_mrcc2k6u_cec4271c. |
| AC6 | acceptance_criterion | pass | test | Completed-candidate dry-run/report path plus legacy status-index repair dry-run tested; targeted suite tr_mrcbrhfk_6ec055f0 passed. |
| AC7 | acceptance_criterion | pass | test | Regression coverage includes retire success/reject, active list exclusion, CLI behavior, retained history, candidate dry-run, and index repair. Final full suite tr_mrcc8neq_5dc347fd passed. |
| C1 | constraint | respected | static_check | Retired projection read/write and show fallback retained; no deletion path added. Review final READY. |
| C2 | constraint | respected | static_check | Active listing semantics centralized in AdvEpicStatus + Temporal Visibility query; explicit repair backfills missing index. Not consumer-side inference. |
| C3 | constraint | respected | static_check | No gate/order blocking added; Epic order behavior unchanged aside from lifecycle/listing/index repair. |
| C4 | constraint | respected | static_check | Retire/index repair use Temporal workflow signals and store methods; agents did not mutate ADV state files directly. |
| C5 | constraint | respected | static_check | Retire preflight/workflow guard requires completed progress and no active/future entries; rejection tests passed. |
| C6 | constraint | respected | static_check | CLI list reads Temporal Visibility only; disk-backed child enrichment removed by reviewer; bin tests tr_mrcc2k6u_cec4271c passed. |
| C7 | constraint | respected | static_check | Epic owner routing used for retirement and repair surfaces; tool tests cover owner-routed behavior. |
| DONT1 | avoidance | respected | review | No silent deletion; retirement persists projection before archive/completion; retained history tests pass. |
| DONT2 | avoidance | respected | review | Consumers do not infer completion; AdvEpicStatus index owns active/default filtering, with explicit repair for legacy missing index. |
| DONT3 | avoidance | respected | review | Existing completed Epics are reported via dry-run/candidate path; no automatic retirement added. |
| DONT4 | avoidance | respected | review | No Jira-like assignments/boards/sprints/estimates or mandatory Epic membership added. |
| DONT5 | avoidance | respected | review | No product launcher/API expansion; CLI surface stayed local to existing adv epic list behavior. |
| DONT6 | avoidance | respected | review | Change archive/release semantics unchanged except necessary Epic terminal projection/index evidence. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out of scope; no mandatory Epic membership introduced. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out of scope; no Jira-like planning primitives introduced. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Out of scope; history deletion avoided and typed access preserved. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Out of scope; no broad change archive/release rewrite performed. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Out of scope; no product-wide launcher/API changes added. |
| OOS6 | out_of_scope | not_applicable | not_applicable | Out of scope; no automatic bulk retirement/backfill of completed Epics. Added explicit audited status-index repair only after user chose Strict + repair. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2ff38e76ea5e | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | AC7 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
| tk-e5fb4a3b130c | SC3, AC4 | AC4 | C1, C4, DONT1, OOS3 |  |
| tk-d31449980863 | SC1, AC1, AC2 | AC1, AC2 | C4, C5, C7, DONT1, DONT3, OOS6 |  |
| tk-b4a42fe60eda | SC2, SC4, AC3, AC5, AC6 | AC3, AC5, AC6 | C2, C6, DONT2, DONT3 |  |
| tk-b60e47a8b5c8 | SC1, SC3, AC1, AC2, AC4 | AC1, AC2, AC4 | C1, C4, C5, C7, DONT1, DONT3 |  |
| tk-8c47ba1c3118 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6 |  |
