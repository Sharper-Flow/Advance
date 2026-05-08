## Objectives

1. Add actionable stale-ledger remediation text to compaction output.
2. Avoid false positives for healthy in-progress, fresh-pending, and completed execution states.
3. Keep implementation pure and testable in `utils/compaction-context.ts`.

## Acceptance Criteria

| AC | Statement | Verification |
|----|-----------|--------------|
| AC1 | Stale state with execution incomplete + no active task + pending work emits remediation hint | Unit test |
| AC2 | Orphaned state with execution incomplete + no active task + all tasks terminal emits remediation hint | Unit test |
| AC3 | Valid `in_progress` task output remains normal `Current:` context line and emits no stale hint | Unit test/existing test |
| AC4 | Fresh pending-only plan emits no stale hint | Unit test |
| AC5 | All tasks done/cancelled with execution gate done emits no stale hint | Unit test |
| AC6 | Missing gates degrade safely and emit no stale hint | Unit test |
| AC7 | Hint tells agent to call `adv_change_show include.snapshot=true include.readyTasks=true` and continue from `_readyTasks` or acceptance | String assertion |
| AC8 | No IO added to `utils/compaction-context.ts` | Code review / existing purity expectations |
| AC9 | `pnpm run check` passes | Verification task |
| AC10 | targeted compaction tests pass | Verification task |

## Dependencies

None.