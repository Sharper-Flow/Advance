# Executive Summary — addUserFocusVoiceRule

## Outcome

ADV agents now have a codified User-Focus voice rule. The rule tells agents to lead user-facing messages with what the user sees / what changes for them, and to move implementation detail (file paths, function names, schema fields) into durable artifacts (design docs, wisdom, code comments) instead of chat.

## Value / why it matters

Before this change, agents collaborating with the user on decisions would drift into implementation-speak — describing impact via internal artifact names rather than user-visible outcomes. This forced the user to mentally translate ("the snapshot JSON `providers` field changes" → "what does that mean for me?") before they could decide. Small user-visible changes got inflated by implementation framing; large ones got buried. The new rule sits in the canonical voice standard at the top (after Core Rules), applies to all user-facing text, and is reinforced by a pointer bullet in the deployed ADV system prompt so agents see it under delivery pressure when doc consultation is least likely.

## What was verified

- All 4 constraints + 3 avoidances from the approved agreement pass independent reviewer audit (file:line cited per item).
- 98/98 voice-enforcement drift tests pass (manifest, manifest-doc-drift, checkpoint-surface-drift, handoff-footer-drift, decision-rationale-assets).
- `pnpm run check` exits 0 (schemas, typecheck, agent-manifest/test-isolation/lockfile, lint, format).
- Deploy dry-run confirms `.opencode/agents/adv.md` is in the deployment payload; tool drift check passes (83 tools).
- Campsite fix verified: 3 downstream surfaces (adv-triage.md, README.md, ADV_INSTRUCTIONS.md) now match the manifest source of truth for /adv-triage description.

## Risks / follow-ups

- **Judgment-applied only.** The rule is `inherently-prose` — no drift test enforces it. This is by design (regex/schema can't capture translation judgment) but means compliance is agent-discipline, not machine-checked.
- **Overlay mirror is non-deploying.** `.opencode/overlays/adv.overlay.md` carries the same bullet for repo convention consistency, but `apply_overlay_block` skips `adv` in the deploy chain. The deployed source is `.opencode/agents/adv.md`. Future contributors editing only the overlay will see no live effect.
- **Requires deploy + restart.** The new bullet reaches the live ADV system prompt only after `./scripts/deploy-local.sh` runs and OpenCode restarts. Pre-deploy, the rule lives in docs only.
- **No follow-up ADV changes required.** The campsite fix absorbed /adv-triage drift; no separate cleanup change needed.

## Supporting evidence

- Reviewer report: adv-reviewer, verdict READY, 0 findings, attempt 2 (PHASE=review).
- Wisdom entry promoted project-wide (ws-NDWDcb): documents the manifest-description drift pattern from PR #264 for future contributors.
- Git: branch `change/addUserFocusVoiceRule`, 2 commits (7d3b1124 + 439742ee), 6 files, +43 lines.
