# Executive Summary

## Outcome

The misleading "See the ADV_SYNC block at the top of this prompt for routing guidance" cross-reference has been removed from 3 sites in user `build.md` and `plan.md`. These references were introduced during fixSubAgentMcpRouting AC4 but were inaccurate for build/plan (their ADV_SYNC overlays lack the canonical contract per design AD8/OOS5 preserved asymmetry). Routing behavior is unchanged — still supplied by the always-on global `~/.config/opencode/instructions/lgrep-tools.md` instruction.

## Why It Matters

The previous wording told build/plan agents to look in their ADV_SYNC block for routing guidance that wasn't there. Functionally harmless (routing covered globally) but technically misleading. This fix tightens the prose so what the prompt claims matches what the prompt contains.

## Verdict

APPROVED (0 blockers, 0 issues, 0 suggestions)

## What Was Built

3 prose edits to 2 user config files (outside any git repo):
1. `~/.config/opencode/agents/build.md:161` — dropped "See the ADV_SYNC block..." clause; retained "Reach for the highest-fidelity capability..." preference prose
2. `~/.config/opencode/agents/plan.md:158` — dropped "See the ADV_SYNC block..." clause; retained fallback rule
3. `~/.config/opencode/agents/plan.md:162` — softened to "discover them via your active tool surface:" (preserves table introduction)

No advance-repo changes. No spec deltas. No tests.

## What Was Verified

- **Verdict**: APPROVED, 0 findings
- **Tests**: n/a — prose-only change to user config files; no executable test surface (evidence_policy: source_audit)
- **Contract matrix**: 17/17 rows pass/respected/not_applicable (2 SC, 4 AC, 4 C, 4 DONT, 3 OOS)
- **Source audit**: grep confirms 0 remaining "ADV_SYNC block" references in scope; ADV_SYNC markers preserved (build.md:60/70, plan.md:37/48); section count unchanged (build: 16, plan: 19); frontmatter preserved

## Remaining Concerns

- **Out-of-scope references** (not blocking, separate future cleanup candidate): build.md:165 and plan.md:173 contain softer "ADV_SYNC routing contract" references in `## Docs-first for unfamiliar surfaces` section. Different section per AC4 scope restriction. Substantively same issue; can be cleaned up in a future change.
- **OpenCode restart required**: User config file edits do not take effect until OpenCode is restarted.

## Supporting Evidence

- Task: `tk-19b76df53b08` (3 cross-reference sites softened)
- Worktree checkpoint: status `clean`, sha `58bbf734b404cc557589200bf7c75485c9b5a0e5` (advance-repo source tree unchanged)
- Contract matrix: 17 rows persisted via `adv_contract_review_matrix_set`

## Consequence Context

1. **Delivered value**: Tightens prompt prose accuracy for build/plan agents; removes misleading cross-reference introduced during fixSubAgentMcpRouting AC4
2. **Enabling-only/follow-up dependency**: n/a — self-contained
3. **Ops readiness**: pending — harden owns release readiness. Operational step: user must restart OpenCode for edits to take effect
4. **Migration/data impact**: n/a — pure prose change to user config files
5. **Frontend/preview impact**: not_applicable — no UI surface
6. **Collision/release risk**: none — no advance-repo changes; no merge conflicts possible (work is outside any git repo)
7. **Open follow-ups**: 1 non-blocking future cleanup (build.md:165 / plan.md:173 references in different section per AC4)
8. **Next action**: acceptance approval proceeds inline to `/adv-harden softenBuildPlanAdvSyncCross`