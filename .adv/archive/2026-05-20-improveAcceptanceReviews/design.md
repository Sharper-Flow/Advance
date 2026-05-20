# Design

## LBP Validation Verdict
✅ Confirmed. The change should target the human-readable acceptance review report shape, not the machine-readable `REVIEW_FINDINGS` block or final gate handoff spine.

## Source of Truth
Primary target: `.opencode/command/adv-review.md`.

Relevant adjacent surfaces:
- `docs/checklists/review-checklist.md` — only if checklist wording needs supporting report-format guidance.
- `plugin/src/adv-skill-backed-commands-assets.test.ts` — asserts review command shape and `REVIEW_FINDINGS` presence.
- `plugin/src/handoff-footer-drift.test.ts` and `plugin/src/commands-spine-assets.test.ts` — protect the final handoff spine; should remain passing and likely unchanged.
- `plugin/src/checkpoint-surface-drift.test.ts` and `plugin/src/__tests__/human-checkpoints-assets.test.ts` — protect acceptance prompt placement.

## Direction
Update acceptance review output guidance at the source of truth so review summaries include an outcome-oriented executive summary and structured ordered/nested detail lists.

## Boundaries
- Do not modify the final `## Problem / ## Chosen direction / ## Delivered` handoff spine unless tests show it is directly affected.
- Do not modify the `REVIEW_FINDINGS` machine-readable block.
- Do not leak process mechanics into the executive summary; summarize verdict, finding counts, fixes, remaining concerns.

## Implementation Strategy
1. Update `.opencode/command/adv-review.md` Phase 4 display-summary guidance with a concrete report shape:
   - `### Executive Summary`
   - `### Verdict`
   - ordered delivered-work or review-scope list
   - ordered/nested remediation summary when remediation exists
2. Update Phase 6 final-report guidance so numbered findings/remediation are grouped and nested consistently.
3. Preserve acceptance sign-off prompt wording and the final harden handoff block.
4. Update or add nearby asset tests only if the new output contract should be enforced by tests.

## Validation
- Run focused command asset tests touching `adv-review.md`.
- Run broader checks if test changes touch shared command/manifest assertions.