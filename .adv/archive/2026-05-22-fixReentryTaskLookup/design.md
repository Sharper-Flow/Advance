# Design

## Direction

Validator verdict: `PASS_WITH_NOTES`. The primary fix is to co-locate reverse task indexing with cached workflow-state materialization.

1. Strengthen Temporal store cache/index behavior:
   - When cached workflow state is mapped to a change, also index every task in `state.tasks` into `taskChangeIndex`.
   - This makes change refresh, `changes.get`, `gate.reopenFrom`, and post-mutation refresh populate the reverse index structurally.

2. Add a bounded task-tool fallback resolver:
   - Keep the fast path: `store.tasks.show(taskId)`.
   - If missing or throwing because of stale index/workflow state, list active/non-terminal changes and query each change's task list from workflow state using `changeTasksQuery`.
   - Stop at the first typed task-array match; do not scan archived/closed changes by default.
   - Use this fallback only for task-id-only tools; change-id-scoped tools already query directly.

3. Use the fallback in task-id-only tools that currently call local `resolveChangeId`.

## Error Handling

- Candidate scan failures are non-mutating; skip bad candidates and keep deterministic `Task not found` if no candidate contains the task.
- Do not scan archived/closed changes by default.
- Do not parse tool-output text to infer ownership; only inspect typed task arrays returned by workflow queries.
- Existing redundant `indexTasksFromState` calls are harmless/idempotent and can remain unless cleanup is adjacent and safe.

## Tests

- Unit test for fallback: `adv_task_show` resolves a task when `store.tasks.show` returns null but active change workflow task query contains it.
- Unit test for stale fast-path throw: `adv_task_show` resolves a task when `store.tasks.show` throws but active change workflow task query contains it.
- Unit test for `adv_task_update`: same fallback then fires the appropriate signal.
- Unit test for stale fast-path throw before `adv_task_update` mutation.

## Risks

- Active-change scan could be expensive in huge workspaces. Bound to non-terminal changes and only used after fast path misses.