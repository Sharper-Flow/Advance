## Problem

`getGuardedChangeHandle(...)` protects cross-project safety by reading the legacy disk snapshot and comparing `adv_project_id` with the current store project ID. That guard is correct, but it repeats the same disk read every time a Temporal handle is needed. A single tool operation can request multiple guarded handles for the same change, so the guard adds avoidable duplicate disk IO.

## Evidence

- `plugin/src/storage/store-temporal/shared.ts:84-115` reads `input.legacy.changes.get(changeId)` on each call.
- `plugin/src/storage/store-temporal/tasks.ts` calls `getGuardedChangeHandle` multiple times in `add`, `update`, `cancel`, and query paths.
- `plugin/src/tools/task.ts:490` performs a planning-gate guard before `adv_task_add`, then `store.tasks.add` enters another guarded path.
- Retired old modules (`store-locks.ts`, `loadChangeOrNull`) are absent, so this is the current surviving N× guard-read path.