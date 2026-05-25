# Extend completed workflow recovery

## Intent

`adv_change_archive` now recovers from **poisoned** workflows via `recoveryMode: poisoned_history` + describe probe. But a **completed/terminated** workflow (status COMPLETED, FAILED, TERMINATED, or CANCELED) hits a different error class: `workflow execution already completed | WorkflowNotFoundError`. The current recovery branch only checks `workflowHasPoisonedDescription` (which inspects search attributes for nondeterminism markers) — completed workflows don't carry those markers, so recovery doesn't activate.

Symptom: after a tool-timeout that terminates a workflow, a retry archive fails with the completed-workflow error and the change.json stays at `draft` even though the archive bundle is on disk.

## Scope

- `plugin/src/tools/change.ts adv_change_archive`: extend the `recoveryMode: poisoned_history` branch to also accept completed-workflow errors via `isWorkflowCompletedError` (from `store-temporal/changes.ts`).
- `plugin/src/tools/_recovery-writers.ts`: no change (`saveRecoveredChangeStatus` already disk-direct).
- Tests covering completed-workflow recovery.

## Success Criteria

- [ ] `adv_change_archive` with `recoveryMode: poisoned_history` recovers when the workflow is in a completed/terminated state AND the bundle is already on disk.
- [ ] Healthy archive paths unchanged.
- [ ] Existing poisoned-history archive recovery still works.
- [ ] `pnpm run check`, `pnpm run build`, full `pnpm test` pass.
