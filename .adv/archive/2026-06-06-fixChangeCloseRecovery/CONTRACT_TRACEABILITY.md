# Contract Traceability

**Change ID:** fixChangeCloseRecovery
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-06T20:34:15.628Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `adv_change_close` schema includes optional `recoveryMode` and `recoveryEvidence`; handler validates precise recovery evidence when recoveryMode='poisoned_history'. |
| AC2 | acceptance_criterion | pass | test | `change.test.ts` includes `recovers completed-workflow close failure with audited disk projection`, passing under `bin/oc-test targeted -- src/tools/change.test.ts src/utils/tool-arg-preflight.test.ts`. |
| AC3 | acceptance_criterion | pass | test | `change.test.ts` includes `recovers completed-workflow failures per id during bulk close` and dry-run coverage remains passing. |
| AC4 | acceptance_criterion | pass | test | Existing normal close test `fires changeCancelledSignal with approval metadata` passed; recovery tests prove no recovery without recoveryMode. |
| AC5 | acceptance_criterion | pass | test | Verification passed: targeted tests (150), typecheck, lint, format:check, reviewer ran schemas:check. |
| AC6 | acceptance_criterion | pass | test | The stale close is not completed in this live session because OpenCode caches deployed plugin tool schemas; actual close requires build/deploy and fresh OpenCode session before new recovery args can be invoked. This explicitly satisfies the blocker branch of AC6. |
| C1 | constraint | respected | static_check | No ADV state files edited directly; implementation uses `saveRecoveredChangeStatus` through audited recovery path only. |
| C2 | constraint | respected | static_check | Both close tools still require `approvedByUser: true` and non-blank `approvalEvidence`; recovery does not bypass that validation. |
| C3 | constraint | respected | static_check | Recovery activates only when `recoveryMode === 'poisoned_history'`; no recovery mode returns original completed-workflow error. |
| C4 | constraint | respected | static_check | Bulk close still resolves selection through existing protected/invalid target checks before dry-run or execution. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-63b1c2930c8c | AC1, AC2, AC3, AC4, AC5, AC6 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
