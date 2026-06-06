# Acceptance

Reviewed at: 2026-06-06T20:34:15.628Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_close` exposes recovery arguments and rejects recovery without precise evidence. | pass | `adv_change_close` schema includes optional `recoveryMode` and `recoveryEvidence`; handler validates precise recovery evidence when recoveryMode='poisoned_history'. |
| AC2 | acceptance_criterion | `adv_change_close` succeeds by disk projection only after the normal signal path fails with completed-workflow evidence. | pass | `change.test.ts` includes `recovers completed-workflow close failure with audited disk projection`, passing under `bin/oc-test targeted -- src/tools/change.test.ts src/utils/tool-arg-preflight.test.ts`. |
| AC3 | acceptance_criterion | `adv_change_bulk_close` passes recovery arguments through to every selected close and preserves dry-run behavior. | pass | `change.test.ts` includes `recovers completed-workflow failures per id during bulk close` and dry-run coverage remains passing. |
| AC4 | acceptance_criterion | Existing normal close tests continue to prove signal-first behavior. | pass | Existing normal close test `fires changeCancelledSignal with approval metadata` passed; recovery tests prove no recovery without recoveryMode. |
| AC5 | acceptance_criterion | Targeted tests covering change close recovery pass. | pass | Verification passed: targeted tests (150), typecheck, lint, format:check, reviewer ran schemas:check. |
| AC6 | acceptance_criterion | The stale `renameAdvWorktreeNamespace` close is completed or the session reports the required restart/deploy blocker explicitly. | pass | The stale close is not completed in this live session because OpenCode caches deployed plugin tool schemas; actual close requires build/deploy and fresh OpenCode session before new recovery args can be invoked. This explicitly satisfies the blocker branch of AC6. |
| C1 | constraint | Do not directly edit ADV state files by hand. | respected | No ADV state files edited directly; implementation uses `saveRecoveredChangeStatus` through audited recovery path only. |
| C2 | constraint | Do not bypass user approval metadata. | respected | Both close tools still require `approvedByUser: true` and non-blank `approvalEvidence`; recovery does not bypass that validation. |
| C3 | constraint | Do not make recovery the default path. | respected | Recovery activates only when `recoveryMode === 'poisoned_history'`; no recovery mode returns original completed-workflow error. |
| C4 | constraint | Do not weaken protected/invalid target checks in bulk close. | respected | Bulk close still resolves selection through existing protected/invalid target checks before dry-run or execution. |

