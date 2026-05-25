# Add Opportunity Scout to ADV Discovery and Design

## Problem
ADV discovery and design phases lack a structured mechanism for identifying and surfacing improvement opportunities that emerge naturally during analysis. Agents may notice optimization candidates, convention violations, or architectural gaps but have no structured way to capture, rank, and route these observations.

## Proposal
Add an **Opportunity Scout** skill (`skills/adv-opportunity-scout/SKILL.md`) that integrates into both the discovery (`/adv-discover`) and design (`/adv-design`) workflows as optional phases:

- **Discovery Phase 3.5**: Scans discovery findings for improvement candidates (unused patterns, missing conventions, near-miss inconsistencies)
- **Design Phase 2.5**: Checks if existing solutions, prior art, or partial implementations can be leveraged before designing from scratch

The scout uses an 8-field `ScoutCandidate` schema, a 5-fate routing taxonomy (promote-to-change, fast-follow, note, backlog, dismiss), a hard cap of ≤5 candidates, an INCONCLUSIVE degradation path, and opt-out for trivially scoped changes.

## Artifacts
- `skills/adv-opportunity-scout/SKILL.md` — Skill definition with discovery/design modes
- `.opencode/command/adv-discover.md` — Phase 3.5 integration
- `.opencode/command/adv-design.md` — Phase 2.5 integration  
- `docs/checklists/discover-checklist.md` — Scout step + edge cases
- `.adv/specs/adv-discover/spec.json` — Delta rq-discOpportunityScout01/02
- `.adv/specs/advance-workflow/spec.json` — Delta rq-designOpportunityScout01
- Asset tests for phase anchors and scout schema