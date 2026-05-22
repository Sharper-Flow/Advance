# Contract Traceability

**Change ID:** extendCompletedWorkflow
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-22T04:10:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/tools/change.ts recovery branch detects isWorkflowCompletedError(saveError), calls saveRecoveredChangeStatus, and returns _recoveryMutation:true; regression test plugin/src/tools/change.test.ts completed-workflow recovery passed. |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/change.ts only enters recovery when recoveryMode='poisoned_history'; no-recovery regression test returns failure on workflow completed error. |
| AC3 | acceptance_criterion | pass | test | Non-completed save errors still run workflowHasPoisonedDescription; poisoned-description regression test passed. |
| AC4 | acceptance_criterion | pass | test | New regression tests in plugin/src/tools/change.test.ts cover completed-workflow recovery, no-recovery failure, and poisoned-description recovery. |
| AC5 | acceptance_criterion | pass | test | GREEN: pnpm test -- src/tools/change.test.ts src/storage/store-temporal/changes.test.ts; pnpm run check; pnpm run build; pnpm test. Reviewer also reran targeted tests successfully. |
| C1 | constraint | respected | static_check | plugin/src/tools/change.ts validates explicit recoveryMode='poisoned_history' plus non-empty precise recoveryEvidence before recovery branch. |
| C2 | constraint | respected | static_check | No new direct fs write path introduced; status mutation uses existing saveRecoveredChangeStatus path. |
| C3 | constraint | respected | static_check | Healthy path is unchanged and standard error response remains outside recovery branch. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6994fb8bf2a9 | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3 |  |
