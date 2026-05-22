# Executive Summary

Implemented workflow-backed recovery for task-id-only lookup after re-entry.

## Outcome

- `adv_task_show` and `adv_task_update` now recover when `store.tasks.show(taskId)` cannot resolve a workflow-visible task.
- The fallback is structural: active/non-terminal changes are queried through typed `changeTasksQuery` task arrays.
- `setCachedChange` now hydrates the reverse task→change index whenever workflow state is materialized, covering re-entry and post-signal refresh paths.
- Stale fast-path errors are handled the same as null misses, so unavailable old workflows do not block live-state resolution.

## Verification

- RED: stale-index fallback tests failed before implementation.
- GREEN: `pnpm test -- src/tools/task.test.ts`.
- GREEN: `pnpm test -- src/tools/task.test.ts src/storage/store-temporal/index.test.ts`.
- GREEN: `pnpm run check`.
- GREEN: `pnpm run build`.
- GREEN: `pnpm test`.
- Independent review: PASS_WITH_NOTES/READY; reviewer applied low-risk stale-throw fix; main agent re-ran targeted/check/build/full suite successfully.