# Contract Traceability

**Change ID:** fixArchiveMissingWorkflow
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-24T04:34:22.450Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Flipped archive test asserts missing-workflow change archives via disk projection + writes bundle (tr_mryec6u4). |
| AC1 | acceptance_criterion | pass | test | monotonic-recovery.test.ts typed WorkflowNotFoundError -> recover_via_disk; archive-phase9 flipped test asserts loadChange + archiveChange (tr_mryef197). |
| AC2 | acceptance_criterion | pass | test | Poisoned probe-first path preserved; 19+48 tests green. |
| AC3 | acceptance_criterion | pass | test | describe() healthy -> proceed_with_signal (unchanged). |
| AC4 | acceptance_criterion | pass | test | it.each guards: not-found/NOT_FOUND and completed message-substrings -> proceed_with_signal; signal-error query_failed -> operator_required unchanged. |
| AC5 | acceptance_criterion | pass | test | archive-phase9 test: missing workflow + incomplete disk -> 'Cannot archive: incomplete gates' + archiveChange NOT called. |
| C1 | constraint | respected | static_check | Diff +168/-23; no new persistence/daemon. |
| C2 | constraint | respected | static_check | isWorkflowAbsentByExactName reuses existing COMPLETED_WORKFLOW_NAMES; DRY refactor. No parallel classification. |
| C3 | constraint | respected | static_check | Disk branch only swaps read source; AC5 proves no fabrication. |
| DONT1 | avoidance | respected | review | Probe-first catch recovers ONLY on isWorkflowAbsentByExactName; guards pin this. |
| DONT2 | avoidance | respected | review | No recoveryMode/recoveryEvidence reintroduced. |
| OOS1 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3d92d226da62 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 |  |  |
| tk-8687db5a966c | AC1, AC5 | AC1, AC5 |  |  |
