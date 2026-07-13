# Executive Summary

## Outcome
This change makes the ADV provider-evaluation harness test the models actually in use today, and closes a whole class of tool-call failures where strict-mode GPT sessions could deadlock on placeholder values. The approver is signing off on a self-contained tooling/quality fix with no production or user-facing surface.

## Why It Matters
Provider evaluations were scoring stale model generations, so their results did not reflect current ADV behavior — the diagnostic that motivated this work. Separately, strict-mode providers (notably GPT) fill unused optional fields with blank/zero placeholders, which could reject valid tool calls; this change normalizes those away for every affected optional field and adds a guard that prevents the gap from silently reopening.

## Verdict
APPROVED

## What Was Built
1. Provider-evaluation targets and prompt labels updated to the current models (GPT-5.6 Terra, GLM-5.2, Kimi K2.7 Code, Claude Opus 4.8), using pinned canonical identifiers so results stay reproducible.
2. Strict-mode placeholder handling completed across all affected optional tool fields (19 groups), so blank/zero placeholders no longer block valid calls while required audit/approval/identity fields still reject blanks.
3. A structural coverage guard (schema-backed test) that fails if any future optional field lacks placeholder handling — it caught 4 fields the manual audit missed.

## What Was Verified
- Verdict: APPROVED with 0 findings (0 blockers, 0 issues).
- Tests: 269 green — provider-eval config (8), preflight incl. coverage guard (100), plus epic/roadmap/backlog/tool-registry (161). Typecheck + lint clean. TDD RED→GREEN recorded on the guard.
- Preview URL: not_applicable — script configuration and tool-boundary validation only; no front-end or visual output (contract matrix C-rows respected).
- Contract matrix: 17/17 required rows pass/respected, 0 failing.

## Remaining Concerns
None blocking. Two non-blocking follow-ups queued as agenda items: nested `adv_subagent_report_submit.report` placeholder normalization (separate structural design); Caveman `lite` mode (separate Toolbox change).

## Supporting Evidence
- Tasks: tk-a2890b25108e (targets/labels), tk-2b89b9cf3042 (policies), tk-6ff82311335f (guard), tk-88c68912b848 (verification).
- Run IDs: tr_mriog0jc (provider-eval), tr_mriog254 (preflight+related), tr_mrinvh8y→tr_mrioetbr (guard RED→GREEN).
- Design validation: adv-researcher clean pass (all 4 OpenRouter slugs verified against official model pages).
- Contract review matrix: 17 rows, 0 failing.

## Consequence Context
1. Delivered value: pass — eval harness now reflects current models; strict-mode placeholder deadlock class closed with a regression guard.
2. Enabling-only/follow-up dependency: n/a — self-contained; no downstream change depends on this to ship (source: agreement scope, no ops_followup links).
3. Ops readiness: pending — harden owns release/deploy/production/docs/cleanup readiness.
4. Migration/data impact: n/a — no schema, storage, or data migration; source: diff touches only scripts + preflight util.
5. Frontend/preview impact: not_applicable — visual_surface false; no browser-visible output.
6. Collision/release risk: low — 8 files, all provider-eval + preflight; no live routing/hint config touched; related tool suites green.
7. Open follow-ups: 2 non-blocking agenda items (nested report normalization; Caveman lite).
8. Next action: acceptance approval proceeds inline to /adv-harden alignProviderEvalTargets.