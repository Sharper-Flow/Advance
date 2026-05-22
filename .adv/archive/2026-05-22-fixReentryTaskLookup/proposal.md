# Fix reentry task lookup

## Intent

After design re-entry and adding new tasks, task lists/readiness can show the new tasks while task-id-only operations (`adv_task_show`, `adv_task_update`) may return `Task not found`. This blocks same-session execution of re-entry tasks.

## Scope

- Harden task-id → change-id resolution for task-id-only tools.
- Ensure task indexes/caches are refreshed/populated after workflow state reads that include tasks.
- Add regression coverage for re-entry/new-task lookup paths.

## Error Handling

If fallback resolution cannot find the task in active workflow state, the tools keep returning the existing deterministic `Task not found` response. If an active-change task scan hits a workflow/query error for one candidate, it should skip that candidate or surface the underlying failure only when no safe result exists; it must not mutate state while resolving.

## Success Criteria

- [ ] New tasks added after re-entry are immediately mutable via `adv_task_show` and `adv_task_update` in the same session.
- [ ] `adv_task_ready` / `adv_task_list` visibility and task-id-only mutation use consistent workflow-backed state.
- [ ] Existing task lookup paths remain unchanged for indexed/disk-backed tasks.
- [ ] Targeted tests, `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.
