# Design

## Direction

In `adv_change_archive`'s save-error catch block, after the existing `contextMismatch` check, when `recoveryMode === "poisoned_history"` is set:

1. **Existing path** — probe `workflowHasPoisonedDescription(handle)`. If true → `saveRecoveredChangeStatus`.
2. **New path** — also detect completed-workflow errors via `isWorkflowCompletedError(saveError)`. If true → `saveRecoveredChangeStatus`.

The detection function is already used inside `close()` and `closeBatch()` for similar purposes; reusing it keeps the semantics consistent.

## Implementation

```ts
if (recoveryMode === "poisoned_history") {
  const { isWorkflowCompletedError } = await import(
    "../storage/store-temporal/changes"
  );
  // ... existing probe via workflowHasPoisonedDescription ...
  // NEW: also accept completed-workflow errors
  const completed = isWorkflowCompletedError(saveError);
  if (poisoned || completed) {
    await saveRecoveredChangeStatus({...});
    return formatToolOutput({ success: true, _recoveryMutation: true, ... });
  }
}
```

## Tests

`change.test.ts`:
- New test: mock `store.changes.save` to throw "workflow execution already completed" → archive with recoveryMode succeeds via disk-direct.

## Risks

- **Risk:** `isWorkflowCompletedError` might match transient connection errors. **Mitigation:** the helper is specifically tuned for terminal-workflow text patterns; reused across close/closeBatch with no false positives observed.