# Design — tighten handoff voice

## Spec deltas (draft obligations, capability: advance-workflow)

### Delta 1 — MODIFY rq-handoffVoice01 (Gate Handoff Voice Spine)
Add to body: The narrative spine sections (Problem / Chosen direction / Delivered) MUST NOT contain evidence tables or file:line citation dumps; a specific citation is permitted only when the user needs it for the decision at hand. `## Delivered` MUST be a terse artifact list (names/paths/counts), not a narrative of completed/found/assessed work. Handoff prose MUST use plain technical English: everyday words over jargon where both work, short sentences, active voice. Checkpoint presentations MUST NOT include next-phase previews beyond one line or enumerated adjustment menus.
New scenario rq-handoffVoice01.N (no-evidence-tables): given a gate handoff after research-heavy work; when rendered; then no evidence tables/file:line dumps in spine sections, Delivered is an artifact list, no preview/menu elaboration.

### Delta 2 — MODIFY rq-inlineApproval01 (Inline Approval)
Modify body: Tier A reply instructions MUST be a single line — `Reply \`continue\` to proceed, or reply with what to adjust.` — covering approve (whitelist + command-as-approval), revise (any adjustment text via LLM fallback classification), redirect (slash command), stop (stop words). Tier B whitelist lists remain unchanged in docs but rendered options stay ≤2 lines.
Scenario update rq-inlineApproval01.1/.2: reply-instruction line matches the compressed form.

## Implementation notes
- docs/command-voice-standard.md: new rules under Gate Handoff Voice + Inline Approval Voice; BAD/GOOD transcript pair from 2026-08-18 Azure Key Vault example; Tier A template swap.
- 7 checkpoint command docs: swap 4-line reply blocks for single line.
- Tests updated same-change: checkpoint-surface-drift.test.ts + handoff-footer-drift.test.ts anchor phrases.
- Check .opencode/agents/adv.md + plugin/src command manifest assets for embedded template copies.

## Tests
- plugin vitest suite green (drift tests updated).
- Manual BAD/GOOD review vs new standard.