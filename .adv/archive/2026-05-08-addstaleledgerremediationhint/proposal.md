## Intent

Add an actionable remediation hint when ADV compaction detects stale task-run ledger / resume context state. Current compaction comments in `plugin/src/index.ts:803-805` say stale-ledger detection replaces a resume hint with an explicit warning when the referenced task is cancelled or done, but the compacted context does not provide a concrete recovery path for agents/users.

This is part 5 of umbrella tracker `ag-55f13852-56ba-4829-937b-051b42917788` (Telemetry & Temporal follow-ups from fixTemporalContextMismatch).

## Scope

In scope:
- `plugin/src/utils/compaction-context.ts` — pure stale-ledger remediation formatting in compaction output.
- `plugin/src/__tests__/compaction.test.ts` or focused utility tests — cover stale and non-stale compaction states.

Out of scope:
- Changing task-run ledger persistence.
- Changing task status semantics.
- Temporal worker repair logic.
- Other umbrella items (#3, #4, #6, #7).
- Warning on healthy idle states (fresh pending work, all work complete, or active task still in progress).

## Success Criteria

- Compaction output includes a concrete remediation hint when execution is incomplete and the task state has no active task despite unfinished/orphaned work.
- Compaction output does NOT warn for valid in-progress task state.
- Compaction output does NOT warn for fresh pending-only plans.
- Compaction output does NOT warn for all-tasks-done state when execution gate is already done.
- Hint tells agent to call `adv_change_show` with `include.snapshot=true` and `include.readyTasks=true`, then continue from `_readyTasks` or move to acceptance when all tasks are terminal.
- Implementation stays pure in `utils/compaction-context.ts` (no IO/store access).
- `pnpm run check` passes.
- Targeted compaction tests pass.

## Out of Scope

- Auto-repairing stale ledger state.
- Adding new ADV tools.
- Running Temporal repair commands automatically.