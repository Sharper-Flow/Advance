# Executive Summary: Add Opportunity Scout

## Outcome
Added a structured Opportunity Scout skill that integrates into ADV discovery (Phase 3.5) and design (Phase 2.5) workflows. The scout surfaces improvement candidates during analysis with an 8-field schema, 5-fate routing taxonomy, hard cap of ≤5 candidates, INCONCLUSIVE degradation path, and opt-out for trivially scoped changes.

## What shipped
- `skills/adv-opportunity-scout/SKILL.md` — 212-line skill with two modes, full schema, routing, constraints
- `.opencode/command/adv-discover.md` — Phase 3.5 (Discovery Opportunity Scout)
- `.opencode/command/adv-design.md` — Phase 2.5 (Design Leverage Scout)
- `docs/checklists/discover-checklist.md` — Updated with scout step and edge cases
- `.adv/specs/adv-discover/spec.json` — v1.1.0→v1.2.0, rq-discOpportunityScout01/02
- `.adv/specs/advance-workflow/spec.json` — v1.9.0→v1.10.0, rq-designOpportunityScout01
- Asset tests for phase anchors and scout schema

## Verification
- All 2512 tests pass (207 files, 2 skipped)
- Independent review: READY verdict
- Single commit: adc215f

## Impact
- Pure skill/command-layer change — no plugin runtime code modified
- Additive only: no breaking changes to existing discovery/design workflows
- Scout is optional: INCONCLUSIVE degradation means no change if scout cannot determine viability