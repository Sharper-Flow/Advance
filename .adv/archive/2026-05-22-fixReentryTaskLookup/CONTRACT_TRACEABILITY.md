# Contract Traceability

**Change ID:** fixReentryTaskLookup
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-22T05:03:30.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `plugin/src/tools/task.ts` resolveChangeId falls back from null/throwing `store.tasks.show` to active workflow `changeTasksQuery`; tests in `plugin/src/tools/task.test.ts` cover adv_task_show null and throwing fast-path fallbacks. |
| AC2 | acceptance_criterion | pass | test | `adv_task_update` resolves via same fallback before firing existing mutation signal; tests cover null and throwing fast-path fallback before `taskAssignedSignal`. |
| AC3 | acceptance_criterion | pass | test | `setCachedChange` hydrates taskChangeIndex from `ChangeWorkflowState.tasks`; fallback scans typed `Task[]` results from `changeTasksQuery`, not chat/tool-output text. |
| AC4 | acceptance_criterion | pass | test | GREEN: `pnpm test -- src/tools/task.test.ts src/storage/store-temporal/index.test.ts`; GREEN after reviewer: `pnpm test -- src/tools/task.test.ts`. |
| AC5 | acceptance_criterion | pass | test | GREEN after reviewer changes: `pnpm run check`; `pnpm run build`; `pnpm test`. |
| C1 | constraint | respected | static_check | No direct ADV state-file reads added; code uses Store APIs and Temporal queries only. |
| C2 | constraint | respected | static_check | Fallback uses default `store.changes.list()` and explicitly skips `archived`/`closed` statuses. |
| C3 | constraint | respected | static_check | Task tools continue resolving `activeStore` through `withOptionalTargetPathStore` / `withTargetPathStore`; fallback receives the same active store. |
| C4 | constraint | respected | static_check | Fallback performs `store.changes.list`, `getHandleForChangeId`, and `changeTasksQuery`; mutation remains the caller's existing `fireSignalAndRefresh` path after ownership is resolved. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-e893d6e4595a | AC1, AC2, AC3, AC4, AC5 | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
