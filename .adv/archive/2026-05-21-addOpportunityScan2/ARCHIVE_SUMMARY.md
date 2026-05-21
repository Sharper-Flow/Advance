# Archive: Add opportunity scan

**Change ID:** addOpportunityScan2
**Archived:** 2026-05-21T03:10:57.525Z
**Created:** 2026-05-21T01:25:56.642Z

## Tasks Completed

- ✅ Create opportunity scout skill (SKILL.md)
  > Created skills/adv-opportunity-scout/SKILL.md with discovery/design modes, 8-field ScoutCandidate schema, 5-fate routing, hard cap ≤5, INCONCLUSIVE degradation, opt-out, and prompt templates. Committed in 7c410cc.
- ✅ Integrate scout into adv-discover and adv-design commands
  > Added Phase 3.5 to adv-discover.md, Phase 2.5 to adv-design.md, updated discover-checklist.md with scout step and edge cases. Committed in 7c410cc.
- ✅ Add spec deltas and asset tests
  > Added spec deltas rq-discOpportunityScout01/02 (adv-discover v1.2.0), rq-designOpportunityScout01 (advance-workflow v1.10.0). Asset tests for phase anchors and scout schema. All 2512 tests pass. Committed in 7c410cc.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** ChangeContract signals (contractSetSignal, contractReviewMatrixSetSignal) are fired by the adv-acceptance command workflow, not by individual tools. When resuming a change from a prior session that was created before the contract mechanism existed, the contract and review matrix must be set via direct Temporal signals before acceptance gate can complete. Use signal names 'adv.change.contractSet' and 'adv.change.contractReviewMatrixSet' (from contracts.ts SIGNAL_NAMES).
