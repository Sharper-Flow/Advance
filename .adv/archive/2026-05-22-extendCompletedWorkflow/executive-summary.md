# Executive Summary

Implemented completed-workflow archive recovery for `adv_change_archive`.

## Outcome

- `adv_change_archive` now accepts explicit recovery when the final archived-status save fails because the workflow is already completed / `WorkflowNotFoundError`.
- Recovery remains gated by `recoveryMode: "poisoned_history"` plus precise recovery evidence.
- Existing poisoned-history describe-probe recovery still works.
- Healthy/no-recovery archive paths still return the original failure instead of silently recovering.

## Verification

- RED: `pnpm test -- src/tools/change.test.ts` failed on the new completed-workflow recovery regression before implementation.
- GREEN: `pnpm test -- src/tools/change.test.ts src/storage/store-temporal/changes.test.ts`.
- GREEN: `pnpm run check`.
- GREEN: `pnpm run build`.
- GREEN: `pnpm test`.
- Independent reviewer: no findings; contract rows all pass/respected.