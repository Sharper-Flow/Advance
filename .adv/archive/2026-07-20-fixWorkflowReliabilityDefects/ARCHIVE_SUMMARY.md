# Archive: Fix workflow reliability defects

**Change ID:** fixWorkflowReliabilityDefects
**Archived:** 2026-07-20T04:56:05.847Z
**Created:** 2026-07-19T15:18:28.366Z

## Tasks Completed

- ✅ Unify session identity and orphan warnings
  > Task checkpoint completed
- ✅ Make coverage and evidence plans stage-correct
  > Task checkpoint completed
- ✅ Expose strict report diagnostics and scope validators
  > Task checkpoint completed
- ✅ Bind worker verification to durable test runs
  > Task checkpoint completed
- ✅ Confirm readiness mutations with workflow receipts
  > Task checkpoint completed
- ✅ Restore acceptance patch replay compatibility
  > Task checkpoint completed
- ✅ Validate archive and worktree behavior at incident scale
  > Task checkpoint completed
- ✅ Integrate, deploy, and verify repaired workflows
  > Task checkpoint completed

## Specs Modified

- **tdd-contract**: 1 delta(s)
- **advance-meta**: 1 delta(s)
- **subagent-reports**: 2 delta(s)
- **advance-workflow**: 3 delta(s)

## Wisdom Accumulated

- **[gotcha]** vitest `shouldAdvanceTime: true` couples the fake clock to real wall-clock time, so `Date.now() - start` AND any executor-internal `clock.now() - startTime` measurement can exceed an explicit `advanceTimersByTime` budget under full-suite load. Use plain `vi.useFakeTimers()` for deadline-contract tests and assert via the executor's captured `meta.elapsed_ms` / outcome `elapsed_ms` rather than wall-clock reads.
