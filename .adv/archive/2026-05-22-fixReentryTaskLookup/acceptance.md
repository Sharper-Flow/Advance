# Acceptance

Reviewed at: 2026-05-22T05:03:30.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_task_show` can resolve a task that exists only in live workflow task state for an active change. | pass | `plugin/src/tools/task.ts` resolveChangeId falls back from null/throwing `store.tasks.show` to active workflow `changeTasksQuery`; tests in `plugin/src/tools/task.test.ts` cover adv_task_show null and throwing fast-path fallbacks. |
| AC2 | acceptance_criterion | `adv_task_update` can resolve and mutate that same task without requiring a prior disk projection refresh. | pass | `adv_task_update` resolves via same fallback before firing existing mutation signal; tests cover null and throwing fast-path fallback before `taskAssignedSignal`. |
| AC3 | acceptance_criterion | Task cache/index population occurs structurally from workflow state, not from parsing chat/tool output. | pass | `setCachedChange` hydrates taskChangeIndex from `ChangeWorkflowState.tasks`; fallback scans typed `Task[]` results from `changeTasksQuery`, not chat/tool-output text. |
| AC4 | acceptance_criterion | Existing indexed and disk-backed task lookup tests still pass. | pass | GREEN: `pnpm test -- src/tools/task.test.ts src/storage/store-temporal/index.test.ts`; GREEN after reviewer: `pnpm test -- src/tools/task.test.ts`. |
| AC5 | acceptance_criterion | `pnpm run check`, `pnpm run build`, and full `pnpm test` pass. | pass | GREEN after reviewer changes: `pnpm run check`; `pnpm run build`; `pnpm test`. |
| C1 | constraint | Do not add direct ADV state-file reads. | respected | No direct ADV state-file reads added; code uses Store APIs and Temporal queries only. |
| C2 | constraint | Do not make archived/closed task lookup scan broad terminal history by default. | respected | Fallback uses default `store.changes.list()` and explicitly skips `archived`/`closed` statuses. |
| C3 | constraint | Preserve target_path routing semantics for task tools. | respected | Task tools continue resolving `activeStore` through `withOptionalTargetPathStore` / `withTargetPathStore`; fallback receives the same active store. |
| C4 | constraint | Task resolution fallback must be read-only until the caller explicitly performs its requested mutation. | respected | Fallback performs `store.changes.list`, `getHandleForChangeId`, and `changeTasksQuery`; mutation remains the caller's existing `fireSignalAndRefresh` path after ownership is resolved. |

