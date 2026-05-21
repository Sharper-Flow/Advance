# Agreement: Add Opportunity Scout

## Objectives
1. Add a structured Opportunity Scout skill that surfaces improvement candidates during discovery and design phases
2. Integrate scout into adv-discover (Phase 3.5) and adv-design (Phase 2.5) command workflows
3. Maintain read-only, bounded behavior with explicit opt-out for trivially scoped changes

## Acceptance Criteria
- [x] `skills/adv-opportunity-scout/SKILL.md` exists with discovery and design modes
- [x] ScoutCandidate schema has 8 required fields including contract_tie and recommended_fate
- [x] 5-fate routing taxonomy: promote-to-change, fast-follow, note, backlog, dismiss
- [x] Hard cap of ≤5 candidates per mode execution
- [x] INCONCLUSIVE degradation path when scout cannot determine candidate viability
- [x] Opt-out mechanism for trivially scoped changes
- [x] adv-discover.md updated with Phase 3.5 integration
- [x] adv-design.md updated with Phase 2.5 integration
- [x] discover-checklist.md updated with scout step and edge cases
- [x] Spec deltas for adv-discover (v1.2.0) and advance-workflow (v1.10.0)
- [x] Asset tests for phase anchors and scout schema
- [x] All existing tests pass

## Constraints
- Scout is read-only: never writes files or mutates ADV state
- Scout is advisory: surfaces candidates, does not auto-adopt untied ideas
- Single pass per mode: no iterative research loops
- Not a hard dependency: INCONCLUSIVE is always valid

## Avoidances
- Do not replace the design validator
- Do not re-propose previously rejected approaches
- Do not run unbounded research

## Success Criteria
- All acceptance criteria verified via asset tests (2512 pass)
- Independent reviewer verdict: READY
- No breaking changes to existing discovery/design workflows