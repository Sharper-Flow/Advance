# Archive: Add ADV launcher read projection

**Change ID:** addAdvLauncherReadProjection
**Archived:** 2026-07-23T19:10:47.445Z
**Created:** 2026-07-23T15:20:55.501Z

## Tasks Completed

- ✅ Spec-law delta + ADR for the launcher read-projection (docs deliverable).
  > Task checkpoint completed
- ✅ Pure aggregator module + Zod schema + TDD unit tests for the launcher read-projection.
  > Task checkpoint completed
- ✅ Producer-owned MCP rebuild tool for drift recovery (NOT a `bin/adv` subcommand — CLI source-boundary guard).
  > Task checkpoint completed
- ✅ Extend the EXISTING `writeChangeProjection` activity body to also write the aggregate launcher projection (replay-safe — NO new activity call added to the workflow).
  > Task checkpoint completed
- ✅ Temporal integration test (`.itest.ts`): signal-driven aggregate regeneration with Temporal stopped.
  > Task checkpoint completed
- ✅ Cross-project file-format contract coordination with toolbox `decoupleAdvDisplayTemporal` (the consumer that reads `active-launcher-state.json` from zlauncher).
  > Task checkpoint completed
- ✅ Replay-safety verification (DDC6/KD-1): structural proof + guard test that the workflow's activity-invocation sequence is UNCHANGED.
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 1 delta(s)
