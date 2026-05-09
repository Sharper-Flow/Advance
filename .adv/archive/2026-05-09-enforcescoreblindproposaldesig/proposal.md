## Why
WSJF scores from `/adv-triage` are valid sequencing inputs, but they can leak into quality-sensitive agent contexts. Proposal/discovery/design/prep/apply/review/harden must not infer quality budget from Value, Time Criticality, RROE, Effort, or WSJF.

## What Changes
- Add score-blind quality invariant to `ADV_INSTRUCTIONS.md`.
- Make generated `ROADMAP.md` rank-only and score-free: no `V`, `TC`, `RROE`, `E`, `WSJF` columns and no scoring run-summary wording.
- Keep GH Project v2, `.adv/roadmap-snapshot.json`, `adv_roadmap`, `/adv-triage`, and `/adv-roadmap` score-rich for sequencing.
- Mark `/adv-roadmap` as sequencing-only side quest, not proposal/design quality input.
- Reference invariant from `/adv-proposal`, `/adv-discover`, `/adv-design`, `/adv-prep`.
- Define sanitizer contract for future roadmap-origin issue imports; implementation deferred to `wireIssueChangeLinkage`.
- Add tests for score-free ROADMAP.md and invariant presence while preserving `adv_roadmap` sorting.

## Success Criteria
- ROADMAP.md regenerated rank-only with no score columns or score-summary wording.
- GH Project v2 and snapshot remain score-rich.
- `/adv-roadmap` stays score-visible but sequencing-only.
- ADV instructions and lifecycle command docs define/reference invariant.
- Future issue-import sanitizer contract strips scoring trailers/score-field lines before proposal synthesis.
- Tests prove both score-free ROADMAP.md and preserved score sorting.
- `pnpm run check` passes.

## Scope
### In Scope
ROADMAP.md layout, instruction invariant, command-doc references, sanitizer contract, tests.
### Out of Scope
WSJF scoring changes, GH Project schema changes, `adv_roadmap` API changes, `/adv-proposal #N` implementation, retroactive cleanup.

## Discovery Findings
Confirmed leaks in ROADMAP.md score table and run summary; generator source is `.opencode/command/adv-triage.md` Phase 5. Confirmed `adv_roadmap` score shape should be preserved. Active `wireIssueChangeLinkage` requires sanitizer coordination.

## Draft Spec Deltas
- `rq-scoreBlindQuality01`
- `rq-roadmapMirrorScoreFree01`
- `rq-roadmapOriginSanitize01`

## AMBIGUITY ANALYSIS — no blocking ambiguity findings
Coverage: B:C F:C S:C M:C.