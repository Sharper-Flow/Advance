# Archive: Add adv_task_show tool to retrieve full task details by task ID

**Change ID:** addAdvTaskShowToolToRetrieveFu
**Archived:** 2026-02-09T21:36:00.682Z
**Created:** 2026-02-09T21:14:25.052Z

## Tasks Completed

- ✅ Add adv_task_show tool definition to plugin/src/tools/task.ts — takes taskId arg, calls store.tasks.get(), returns full Task + changeId. Handle 'Task Not Found' error.
- ✅ Export adv_task_show in plugin/src/tools/index.ts
- ✅ Register adv_task_show in plugin/src/index.ts tool registration block
- ✅ Refactor: Extract resolveTask(taskId) helper in store.ts to DRY up the 6 methods that repeat the same 8-line task-resolution boilerplate (ensureAllChangesSynced → sqlite.tasks.get → loadChange → tasks.find). Have get, show, update, recordEvidence, setPhase, skipTdd all use it.
- ✅ Run multi-dimensional code review via sub-agents (logic, security, architecture, traceability)

## Specs Modified

