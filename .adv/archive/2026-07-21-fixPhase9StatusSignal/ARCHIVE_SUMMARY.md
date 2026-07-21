# Archive: Fix phase9 status signal durability

**Change ID:** fixPhase9StatusSignal
**Archived:** 2026-07-21T01:20:36.561Z
**Created:** 2026-07-21T00:54:00.113Z

## Tasks Completed

- ✅ Move `await input.store.changes.refresh(input.changeId)` from BEFORE `waitForArchiveReleaseGateCompletion` to AFTER it in `plugin/src/tools/change/archive-gate.ts` (~lines 1089 and 1119).
  > Task checkpoint completed
- ✅ Add regression test in `plugin/src/tools/change.archive-phase9.test.ts` for the signal-processing race fix.
  > Task checkpoint completed

## Specs Modified

