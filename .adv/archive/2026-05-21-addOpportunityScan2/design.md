# Design: Add Opportunity Scout

## Architecture

### Skill File
`skills/adv-opportunity-scout/SKILL.md` — Single skill file with two modes:

1. **Discovery Mode** (Phase 3.5): Scans discovery findings for improvement candidates
   - Identifies unused patterns, missing conventions, near-miss inconsistencies
   - Grounds candidates in the change's agreement/AC
   - Routes via fate taxonomy

2. **Design Mode** (Phase 2.5): Checks for leverageable existing solutions
   - Searches for prior art, partial implementations, ecosystem solutions
   - Reduces redundant design work
   - Surfaces before greenfield design begins

### ScoutCandidate Schema (8 fields)
| Field | Purpose |
|---|---|
| `title` | Short description |
| `category` | pattern/optimization/convention/architecture/leverage |
| `severity` | CRITICAL/HIGH/MEDIUM/LOW |
| `evidence` | Source citation (file:line, spec ref, etc.) |
| `contract_tie` | Which agreement item this relates to, or "untied" |
| `recommended_fate` | promote-to-change/fast-follow/note/backlog/dismiss |
| `payoff` | Expected benefit if adopted |
| `prior_consideration` | Whether this was previously raised and rejected |

### Fate Routing
- **promote-to-change**: High-payoff, contract-tied → auto-suggest new change creation
- **fast-follow**: Moderate payoff, contract-tied → suggest as fast-follow of current change
- **note**: Low payoff or untied → record in wisdom for future reference
- **backlog**: Worth tracking but not now → add to backlog
- **dismiss**: Insufficient evidence or previously rejected → skip

### Integration Points
- `.opencode/command/adv-discover.md` — Phase 3.5 between synthesis and output
- `.opencode/command/adv-design.md` — Phase 2.5 between context load and LBP
- `docs/checklists/discover-checklist.md` — Scout step + edge cases

### Spec Deltas
- `adv-discover` v1.1.0 → v1.2.0: rq-discOpportunityScout01/02
- `advance-workflow` v1.9.0 → v1.10.0: rq-designOpportunityScout01

## Implementation Strategy
Single commit approach: skill file + command integrations + spec deltas + asset tests. No new plugin code required — pure skill and command-layer changes.
