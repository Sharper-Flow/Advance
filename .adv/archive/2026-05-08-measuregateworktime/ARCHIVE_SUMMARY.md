# Archive: measureGateWorkTime

**Change ID:** measuregateworktime
**Archived:** 2026-05-08T17:27:52.455Z
**Created:** 2026-05-08T16:36:20.270Z

## Tasks Completed

- ✅ ## Task: Add task-derived work-time metrics to investment report (TDD)
  > Added task-derived work-time metrics to investment reports while preserving existing wall-clock fields. `per_gate_ms` and `active_elapsed_ms` remain wall-clock-compatible; new `per_gate_work_ms` and `active_work_ms` derive from task interval overlap with completed gate windows. Overlapping intervals are unioned to avoid double-counting; invalid/missing intervals are ignored; gates with no task work are included as 0. RED tests failed on missing fields/helper; GREEN targeted investment tests passed.
- ✅ ## Task: Persist work-time metrics in reflection (TDD)
  > Task checkpoint completed
- ✅ ## Task: Verification — check + targeted timing/reflection tests
  > Verification task passed: `pnpm run check`; targeted timing/reflection tests passed (`pnpm test -- src/tools/investment.test.ts src/tools/reflection.test.ts src/storage/reflection.test.ts src/storage/reflection.archive-passthrough.test.ts`). Checkpoint reported clean tree.

## Specs Modified

