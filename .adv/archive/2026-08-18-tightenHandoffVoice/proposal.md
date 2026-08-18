# Tighten handoff voice + compress checkpoint boilerplate

## Intent
Stop bloated gate-transition messages. Edits to `docs/command-voice-standard.md` and the seven checkpoint-owning command docs:

1. **Evidence stays out of handoff prose.** No evidence tables, no file:line citation dumps in `## Chosen direction` or other spine sections — evidence trails belong in artifacts (problem-statement.md, design.md, wisdom). Exception: a specific citation only when needed for the decision at hand.
2. **No self-narration detail.** Handoffs do not recap what the agent completed, found, or assessed — `## Delivered` stays a terse artifact list (names/paths/counts), not a findings narrative.
3. **Plain technical English (ASD-STE100-inspired).** Handoff prose: everyday words over jargon, short sentences, active voice, one topic per paragraph; exact technical terms verbatim.
4. **Real BAD/GOOD transcript pair** from the 2026-08-18 Azure Key Vault proposal-checkpoint example showing the compliant compressed form.
5. **Ban checkpoint elaboration**: no next-phase previews, no enumerated adjustment menus.
6. **Compress the mandated Tier A reply block** from 4 lines to one: `Reply \`continue\` to proceed, or reply with what to adjust.` Update template, the seven checkpoint command docs, and drift-test anchors (`checkpoint-surface-drift.test.ts`, `handoff-footer-drift.test.ts`).

## Root Cause Analysis
Non-defect (policy tightening + drift). Standard already limits Chosen direction to 1-3 sentences and routes evidence to artifacts, but classed inherently-prose with no enforcement; observed messages drift heavily. Tier A template itself mandates a 4-line reply block inviting elaboration.

## LBP Targets
- Anchor phrases remain parseable by the two drift tests (tests + docs updated in same change).
- Spec-law impact: **Modify** — rq-handoffVoice01 (evidence + plain-English + no-self-narration rules), rq-inlineApproval01 (compressed reply block). Draft spec-delta obligations before planning.
- Build from advance default branch; deploy via `pnpm run build` + `scripts/deploy-local.sh --fix`; OpenCode restart needed.

## Scope
- `docs/command-voice-standard.md`
- 7 checkpoint command docs (adv-proposal, adv-discover, adv-design, adv-prep, adv-review, adv-archive, adv-apply)
- `plugin/src/checkpoint-surface-drift.test.ts`, `plugin/src/handoff-footer-drift.test.ts`
- Spec deltas rq-handoffVoice01 / rq-inlineApproval01
- `.opencode/agents/adv.md` if it embeds the Tier A template

## User Outcomes
- Short, plain-English, decision-only checkpoint messages fleet-wide after rebuild + deploy + restart.