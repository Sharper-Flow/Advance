# Executive Summary

## Outcome

This change closes a structural enforcement gap in ADV: agents were skipping `/adv-problem` triage and jumping straight to `/adv-proposal` or `/adv-task` for bug reports. Now defect-origin changes (bugs, regressions, failures) require a Root Cause Analysis (RCA) before advancing, with bypass visible rather than silent. The approver is deciding whether to ship this advisory enforcement layer.

## Why It Matters

Previously, ADV instructions described triage-before-fix as advisory prose only — no structural layer enforced it, so agents could interpret bug reports as "Start a change" and proceed without root-cause evidence. This produced proposals for symptoms rather than causes and let `/adv-task` fast-track mask undiagnosed defects as "well-understood." This change makes the requirement durable: spec law, command contracts, orchestrator prompt, and CI regex tests all carry the same contract.

## Verdict

APPROVED

## What Was Built

1. **Spec law** — `rq-defectOriginRca01` added to `advance-workflow` capability with 3 scenarios covering defect-origin `/adv-proposal`, `/adv-task` deferral, and ambiguous-defaults-to-defect routing (will apply to global spec at archive).
2. **Command contracts** — `/adv-problem.md` Output adds "Root cause (if defect origin)" line; `/adv-proposal.md` Pre-flight adds step 5 with defect-origin detection, trigger lists, fallback rule, and persisted RCA template; `/adv-task.md` Quick Contract adds ORIGIN class and Phase 1 guard rejecting defect-origin invocations lacking RCA.
3. **Orchestrator prompt** — `adv.md` Step 1 routing table gains footnote with defect/non-defect trigger lists and fallback predicate; `ADV_INSTRUCTIONS.md` HITL row for `/adv-problem` extended to mention RCA evidence carried forward.
4. **Manifest documentation** — `plugin/src/manifest.ts` `prerequisites` field doc-comment clarifies the field is metadata-only (no runtime enforcement).
5. **CI regex tests** — three asset-test files updated with RED→GREEN regex assertions (8 new tests across `adv-problem-assets.test.ts`, `adv-task-assets.test.ts`, `adv-instructions-assets.test.ts`); plus `manifest.test.ts` regex test for the doc-comment.

## What Was Verified

- Verdict: APPROVED with 1 suggestion (non-blocking, deferred to `/adv-harden`)
- Tests: 89 total tests pass (48 asset + 41 manifest); `pnpm run check` exit 0 (runId tr_mru8pl09_b276e4bf)
- Preview URL: not_applicable — pure ADV plugin docs/specs/instruction-text change; no UI surface touched
- Contract matrix: 30/30 rows passed or respected (0 failing)

## Remaining Concerns

- **Advisory-only limitation (known)**: per design DDC4 and validator caution, advisory enforcement cannot mechanically guarantee every agent persists RCA in actual proposals — only that the source wording exists. This matches the existing `rq-problemSpecLaw01` tier. Persisted-artifact requirement (DDC4) is the strongest guarantee available within the user-approved "light touch" direction (C1).
- **1 suggestion deferred**: stage-v2 `static_check` + `code` type route required reviewer evidence disproportionate for 5-line doc-comment changes. Future prep tasks for docs-shaped work should default to `type: docs` + `evidence_policy: artifact_reference` or `test`. Surfaced during tk-60eaa596c95f metadata friction (task cancelled; AC7 verified independently via manifest.test.ts).
- **Cross-repo follow-up tracked**: provider hints package (`opencode-provider-hints`) at `~/.local/share/opencode-provider-hints/providers/*.md` intentionally NOT modified in this change (C4/OOS1). Separate follow-up needed.

## Supporting Evidence

- Spec delta: `dl-defectOriginRca01add` recorded against `advance-workflow` capability
- Contract matrix: 30 rows persisted (runId embedded in `adv_contract_review_matrix_set` response)
- Asset tests: 48/48 pass (runId tr_mru85pyl_d6c10ace)
- Manifest tests: 41/41 pass (runId tr_mrum5y67_a9689903)
- Static checks: pnpm run check exit 0 (runId tr_mru8pl09_b276e4bf)
- Commits: 2fa872d8 (tests RED), f955fb11 (cmd contracts GREEN), b60982e1 (orchestrator GREEN), 93cc25b1 (manifest doc-comment), 8f3406d3 + 2c9c1d3d + 908559cf (manifest test)
- Validator report: `sequenceTriageProposal|change:researcher:design-validation|adv-researcher|1` (caution, advisory-only, no contract compromise)
- Reviewer report: `sequenceTriageProposal|change:review:acceptance|adv-reviewer|1` (manifest task verdict pass)

## Consequence Context

1. **Delivered value**: Defect-origin bug reports now produce Root Cause Analysis evidence before reaching `/adv-proposal` or `/adv-task`. Bypass is intentional and visible, never silent. Sources: SC1-SC4 (pass), AC1-AC5 (pass).
2. **Enabling-only/follow-up dependency**: Provider hints cross-repo follow-up (opencode-provider-hints package) tracked but NOT blocking; depends on separate cross-repo change. Source: OOS1.
3. **Ops readiness**: pending — harden owns release/deploy/production/docs/cleanup readiness. No ops/deploy work in this change (advisory docs/specs/tests only). Source: agreement Preview Applicability `visual_surface: false`.
4. **Migration/data impact**: n/a — pure docs/specs/tests change; no data path, no migration. Source: agreement Preview Applicability.
5. **Frontend/preview impact**: n/a — no UI surface touched. Source: agreement `visual_surface: false`; no front-end, browser-visible, or visual-output work.
6. **Collision/release risk**: low — advisory change is reversible (single commit rollback); no breaking API/contract change. Source: design LBP Analysis section.
7. **Open follow-ups**: 1 cross-repo follow-up (provider hints package); 1 advisory limitation known (DDC4 persisted-artifact is strongest available guarantee within C1). Neither blocking.
8. **Next action**: acceptance approval proceeds inline to `/adv-harden sequenceTriageProposal`; reply `accept`/`approve`/`continue`/`lgtm` to accept, or describe fixes needed.
