# Contract Traceability

**Change ID:** fixPoisonedClosePathPrecheck
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T00:03:15.156Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | adv_change_close with recoveryMode succeeds on Terminated workflow |
| AC2 | acceptance_criterion | pass | test | adv_change_bulk_close with recoveryMode succeeds per-change |
| AC3 | acceptance_criterion | pass | test | workflow_terminate dryRun returns assessment for Terminated with poisoned_history |
| AC4 | acceptance_criterion | pass | test | Healthy workflow path unchanged when recoveryMode absent |
| C1 | constraint | respected | static_check | Uses existing shouldTakeRecoveryBranch, no reinvention |
| C2 | constraint | respected | static_check | shipped_terminal proof requirement unchanged |
| DONT1 | avoidance | respected | review | No batch sweep tool |
| DONT2 | avoidance | respected | review | No validateReviewMatrixRowCoverage changes |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-829b2d23f731 | AC1, AC2, AC3, AC4 |  | C1, C2, DONT1, DONT2 |  |
