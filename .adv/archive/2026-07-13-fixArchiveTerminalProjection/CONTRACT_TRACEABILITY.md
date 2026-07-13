# Contract Traceability

**Change ID:** fixArchiveTerminalProjection
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T20:59:48.385Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Focused verifier suite: store-disk self-heal and status-readback coverage passed (194 tests). |
| SC2 | success_criterion | pass | review | Acceptance reviewer READY; audited bundle/gates/merge reconcile path and readback checked. |
| SC3 | success_criterion | pass | review | Archive timeout classifier tests plus phase9 idempotent re-run test passed. |
| SC4 | success_criterion | pass | review | Archive phase9 terminal-loss regression passed in focused verifier suite. |
| AC1 | acceptance_criterion | pass | test | store-disk and temporal readback tests passed; bundle-dominant archived parity covered. |
| AC2 | acceptance_criterion | pass | test | change.status-repair tests passed, including durable bundle-dominant no-workflow resolution. |
| AC3 | acceptance_criterion | pass | test | change.archive-repair tests cover only shipped repair and incomplete/no-bundle/unmerged/unreadable skips. |
| AC4 | acceptance_criterion | pass | test | archive-timeout and archive-phase9 tests passed; typed still_finalizing and idempotent re-run covered. |
| AC5 | acceptance_criterion | pass | test | Focused verifier suite passed the terminal-loss/archive readback regression surface. |
| AC6 | acceptance_criterion | pass | test | Recovery writes route through saveRecoveredChangeStatus; acceptance review found no direct external-state write bypass. |
| C1 | constraint | respected | static_check | Archive write flow unchanged; timeout handling occurs at tool wrapper after durable-bundle probe. |
| C2 | constraint | respected | static_check | Reconcile requires approvedByUser, approvalEvidence, recoveryReason, and passes authorization to audited writer. |
| C3 | constraint | respected | static_check | Reconcile test verifies no mutation for incomplete gates, missing bundle, unmerged branch, and unreadable records. |
| C4 | constraint | respected | static_check | Diff limited to plugin archive/read/recovery tool surfaces; no worker-supervision changes. |
| DONT1 | avoidance | respected | review | Bundle-aware reads are read-only; no active record resurrection path added. |
| DONT2 | avoidance | respected | review | Timeout typing declines without a durable bundle; reconcile skips candidates missing any shipped invariant. |
| DONT3 | avoidance | respected | review | Reconcile uses saveRecoveredChangeStatus; reviewer inspected direct-write boundary. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Report-transport fragility remains excluded by approved scope. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No Temporal worker supervision or restart redesign included. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-23fd806e1cd9 | SC1, AC1 | AC1 | C1, DONT1, DONT2 |  |
| tk-08b5f7e5c1fe | SC3, AC4 | AC4 | C1 |  |
| tk-f7248412becc | SC2, AC2 | AC2 | C2, C3, DONT2, DONT3 |  |
| tk-29dd9803ee8a | SC2, AC3 | AC3 | C3, DONT2, DONT3 |  |
| tk-a98c3ce70ad3 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
