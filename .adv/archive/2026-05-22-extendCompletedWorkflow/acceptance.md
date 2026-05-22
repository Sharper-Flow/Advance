# Acceptance

Reviewed at: 2026-05-22T04:10:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | When `recoveryMode: poisoned_history` and `store.changes.save({status:"archived"})` throws a "workflow execution already completed" / WorkflowNotFoundError, `adv_change_archive` writes status via `saveRecoveredChangeStatus` and returns success with `_recoveryMutation: true`. | pass | plugin/src/tools/change.ts recovery branch detects isWorkflowCompletedError(saveError), calls saveRecoveredChangeStatus, and returns _recoveryMutation:true; regression test plugin/src/tools/change.test.ts completed-workflow recovery passed. |
| AC2 | acceptance_criterion | Healthy archive (no recoveryMode) still throws on completed-workflow errors (no implicit recovery). | pass | plugin/src/tools/change.ts only enters recovery when recoveryMode='poisoned_history'; no-recovery regression test returns failure on workflow completed error. |
| AC3 | acceptance_criterion | Existing poisoned-history archive recovery via describe probe still works. | pass | Non-completed save errors still run workflowHasPoisonedDescription; poisoned-description regression test passed. |
| AC4 | acceptance_criterion | Regression test covers the completed-workflow path. | pass | New regression tests in plugin/src/tools/change.test.ts cover completed-workflow recovery, no-recovery failure, and poisoned-description recovery. |
| AC5 | acceptance_criterion | `pnpm run check`, `pnpm run build`, full `pnpm test` pass. | pass | GREEN: pnpm test -- src/tools/change.test.ts src/storage/store-temporal/changes.test.ts; pnpm run check; pnpm run build; pnpm test. Reviewer also reran targeted tests successfully. |
| C1 | constraint | Recovery only activates when `recoveryMode: poisoned_history` is explicitly set with valid `recoveryEvidence`. | respected | plugin/src/tools/change.ts validates explicit recoveryMode='poisoned_history' plus non-empty precise recoveryEvidence before recovery branch. |
| C2 | constraint | No new direct fs writes. | respected | No new direct fs write path introduced; status mutation uses existing saveRecoveredChangeStatus path. |
| C3 | constraint | Healthy paths unchanged. | respected | Healthy path is unchanged and standard error response remains outside recovery branch. |

