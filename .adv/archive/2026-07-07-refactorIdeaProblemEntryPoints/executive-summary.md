# Executive Summary

## Outcome
Two top-traffic ADV entry points were rewritten from Socratic Q&A loops to sub-agent-driven flows (`/adv-idea` 5-phase; `/adv-problem` 7-phase tiered evidence). Verdict APPROVED with one `suggestion:` finding (tier-3 secret detection regex should be extracted to a testable constant in a follow-up).

## Verdict
APPROVED

## What Was Built
1. `.opencode/command/adv-idea.md` — replaced Socratic Q&A with 5 phases (Frame → Explore → Synthesize → Size → Exit), now dispatching Task-tool subagents for codebase/ecosystem context and `adv-researcher` for architecture synthesis with `validation.status` flow; any-of consensus initiative-sizing test routes ≥3-subproblem / ≥3-region / >1-repo work to `/adv-epic`. Sub-agent resilience paragraph mirrors `adv-research.md:111-135`.
2. `.opencode/command/adv-problem.md` — replaced Q&A-heavy triage with 7 phases (Frame → Tier 1 local → Tier 2 external → Tier 3 user uploads with secret detection → Spec-law assessment → Triage classify with 6 direct-fix guardrails → Exit). All 7 machine-checked spec-law strings from `adv-problem-assets.test.ts:19-39` preserved verbatim (DDC-2). Sub-agent resilience + ephemeral evidence + read-only safety all explicit.
3. `plugin/src/manifest.ts:136-163` — added `"adv-epic"` to both `adv-idea` and `adv-problem` `successors` arrays; `scope.creates`, `scope.modifies`, `scope.gates` unchanged.
4. `plugin/src/adv-idea-assets.test.ts` (NEW) — 7 test cases mirroring `adv-problem-assets.test.ts` shape, asserting the DDC-1 conditions on `adv-idea.md`. 7/7 GREEN after rewrite.

## What Was Verified
- **Verdict:** APPROVED with 1 suggestion finding (`security` dimension). 0 blockers, 0 issues, 1 suggestion.
- **Tests:** Pre-flight `pnpm run check` (schemas:check, typecheck, lint, format:check — all green after one Prettier auto-format remediation on the new test file). Targeted: **51/51 GREEN** (manifest 40 + adv-problem 4 + adv-idea 7). Full vitest: **4618/4619** in 161s. The 1 failure (`tool-name-assets.test.ts > live prompts do not reference unavailable ADV tool names` on `.opencode/command/adv-coordinate.md: adv_backed_fact`) is **pre-existing and OUT OF SCOPE** — surface, not absorbed.
- **Preview URL:** not_applicable — command files are CLI workflow specs, not visual surfaces (per agreement `visual_surface: false`).
- **Contract matrix:** 22/22 rows reviewed — 9 AC* pass; 3 SC* not_applicable (qualitative, post-archive); 2 C* respected; 5 OOS* respected.
- **TDD discipline:** RED-GREEN pairing preserved (tk-5a50a9e5f97a → tk-614f1a6a4ffb) per `rq-TDD009seq`.

## Remaining Concerns
None blocking. Two follow-up agenda items auto-created for harden phase:
1. Extract Tier-3 secret detection regex to a testable constant + add machine-checkable credential-shape log mock in `adv-problem-assets.test.ts` (closes AC10 verification surface).
2. Pre-existing `tool-name-assets.test.ts` failure on `adv-coordinate.md` — recommend separate ADV change (`fixToolNameAssetsTestOvermatch`) to either extend the test's exclusion list (matches prose references like `adv_backed_fact`) or add the constant to `ADV_TOOL_NAME_SET`. Out-of-scope for this change.

## Consequence Context
- **delivered value:** 2 command rewrites + 1 manifest metadata edit + 1 new test file. Sub-agent delegation is now the spine for the two highest-traffic ADV entry points; initiative-sized work routes to `/adv-epic` instead of forcing a change. Tier-3 user-upload evidence stays ephemeral (no `.adv/` write).
- **enabling-only/follow-up dependency:** none. Both /adv-idea and /adv-problem remain pre-implementation entry points (`requiresChangeId: false`).
- **ops readiness:** pending — harden owns release/deploy/production/docs/cleanup readiness. No operations produced by this change (per AC11: `scope.creates []`, `scope.modifies []`).
- **migration/data impact:** n/a — no schema deltas (NO_DELTAS validation warning); no migrations; no data model changes; pre-flight `schemas:check` green.
- **frontend/preview impact:** not_applicable — workflow-only changes; no UI surface (per agreement `visual_surface: false`). Preview URL: not_applicable.
- **collision/release risk:** none within touched scope. The 1 pre-existing `tool-name-assets.test.ts` failure on `adv-coordinate.md` is unrelated to this change's touched files (`adv-idea.md`, `adv-problem.md`, `manifest.ts`, `adv-idea-assets.test.ts` clean per regex — confirmed by offenders list mentioning only `adv-coordinate.md`).
- **open follow-ups:** 2 (see Remaining Concerns).
- **next action:** acceptance approval proceeds inline to `/adv-harden {changeId}`.