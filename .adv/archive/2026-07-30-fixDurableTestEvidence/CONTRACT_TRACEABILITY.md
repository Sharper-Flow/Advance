# Contract Traceability

**Change ID:** fixDurableTestEvidence
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-30T20:45:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Gate-readiness tests prove valid typed-run entries do not emit verification_missing. |
| AC2 | acceptance_criterion | pass | test | Latest-wins resolution test proves earlier invalid report no longer blocks when later valid report exists. |
| AC3 | acceptance_criterion | pass | test | Cross-task and evicted run ID tests prove fail-closed identity checking. |
| AC4 | acceptance_criterion | pass | test | static_check with command/exit_code=0 proof no longer requires run ID; 114 gate-readiness tests pass. |
| AC5 | acceptance_criterion | pass | test | Behavior-bearing code retains red/green enforcement; test policy unchanged. |
| AC6 | acceptance_criterion | pass | test | Automated coverage includes valid typed-run, earlier-invalid-then-later-valid, and non-code static_check paths. |
| C1 | constraint | respected | static_check | Evidence proof structurally correlated by {changeId, taskId, runId} for test; command/exit_code for static_check. |
| C2 | constraint | respected | static_check | Unrelated green runs cannot substitute; latest-wins only for same task. |
| C3 | constraint | respected | static_check | No new dependencies added. |
| C4 | constraint | respected | static_check | adv_run_test and TDD requirements not widened; existing red/green preserved. |
| C5 | constraint | respected | static_check | Retention loss explicit and auditable; no silent fallback. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No verification removed from behavior-bearing code. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No permissive manual state edits or warning suppression. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No one-size-fits-all testing rule. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-90f4b32a8302 | AC1, AC3 |  | C1, C2, C3, C5 |  |
| tk-c2e6a4e3faca | AC2, AC3, AC5, AC6 |  | C1, C2, C5 |  |
| tk-f017dedd9b87 | AC4 |  | C4, OOS1, OOS2, OOS3 |  |
| tk-d238a621082c |  | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5 |  |
