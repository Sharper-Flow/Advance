# Executive Summary — tightenPreProposalCommands3

## Outcome

Tightened three pre-proposal ADV commands (`/adv-idea`, `/adv-problem`, `/adv-improve`) so their descriptions, command bodies, and routing-table entries all align. Documented the persistence behavior of each command explicitly. Added a missing `iterate` exit to `/adv-improve`. No runtime behavior changed.

## Why it matters

ADV agents and users pick pre-proposal commands based on short descriptions in tables, manifests, and the system prompt. When the description under-sells the command's actual scope (`/adv-improve` claimed "targeted improvements" but actually does broad research including external landscape), agents route wrong. When the description over-promises (`/adv-problem` claimed generic "issues" but the body only handles defects and unintended behavior), users get confused when their non-bug issue doesn't fit. Persistence behavior was undocumented — users were surprised when `/adv-idea` output vanished on session close while `/adv-improve` persisted a research pack.

This change closes those gaps. Agents and users can now reliably pick the right command from the description alone, and persistence behavior is explicit in each command's `Command Boundary` section.

## Verification

All 7 acceptance criteria verified pass:
- **AC1-AC4**: description-string mirroring confirmed via grep (0 matches for old phrases, 5 matches each for new phrases across 5 mirror sites per command).
- **AC5**: `/adv-improve` exits table contains the new `iterate` row.
- **AC6**: all 3 command files contain a `**Persistence:**` rationale line in their `Command Boundary` section.
- **AC7**: `pnpm run check` exits 0 — all schemas, typecheck, agent-manifest, test-isolation, lockfile-policy, lint, and format checks green.

Independent `adv-reviewer` pass: clean — no defects, no missed mirrors, routing intact, `rq-defectOriginRca01` not broken. Contract review matrix: 23/23 rows pass or respected.

## Risks and follow-ups

- **Low risk:** broadened `/adv-improve` description may surprise users expecting only targeted improvements. Mitigation: SETUP.md keeps richer descriptive form; system-prompt routing unchanged.
- **Low risk:** narrowed `/adv-problem` description might push away legitimate non-bug triage. Mitigation: "unintended behavior" wording explicitly covers perf regressions and confusing UX.
- **Pre-existing (out of scope):** exit-table emoji style differs across the three commands (`/adv-idea` and `/adv-improve` use emojis; `/adv-problem` does not). This change does not normalize that — `/adv-improve` follows its own existing emoji-bearing style. Future change could canonicalize if desired.
- **Design caution (low risk, no blockers):** `adv-researcher` design validator flagged the iterate-label emoji inconsistency. Resolved in design DD3 by interpreting AC5 as structural (iterate row + parallel condition text), not literal emoji match across all three.

## Supporting evidence

- 4 commits on branch `change/tightenPreProposalCommands3`:
  - `9a4e33f9` — `/adv-problem` description narrow + Persistence (5 mirror sites)
  - `001ae812` — `/adv-improve` description broaden + iterate exit + Persistence (5 mirror sites)
  - `6d5baee6` — `/adv-idea` Persistence line
  - `9d099780` — prettier format fix on `manifest.ts`
- Independent reviewer report submitted via `adv_subagent_report_submit` (scope `review:acceptance`, verdict READY).
- Design validator report submitted via `adv_subagent_report_submit` (scope `researcher:design-validation`, verdict `caution` with low risk and no blockers).

## Release readiness

- No runtime code changes — pure docs/metadata change.
- No spec deltas — capability laws untouched.
- No migration, no data impact, no ops follow-up.
- No frontend/preview impact.
- Single-repo, single-branch change.
- Safe to merge and deploy.
