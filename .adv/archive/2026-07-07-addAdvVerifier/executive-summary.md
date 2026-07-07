# Executive Summary

## Outcome

This change adds a dedicated `adv-verifier` verification worker path and routes local verify-only bursts to it while keeping ADV state changes, report persistence, and final decisions with the main orchestrator.

## Why It Matters

The change reduces noisy verification work in the main ADV context without expanding worker authority: verifier output is bounded evidence only, `adv_run_test` remains task-level proof, and `adv-ci-waiter` remains the CI/PR polling lane.

## Verdict

APPROVED

## What Was Built

1. Added `.opencode/agents/adv-verifier.md` as a hidden, permission-bounded sub-agent with read/command execution only, no edits, no nested delegation, no prompts/todos, no ADV mutations, and no self-submitted report.
2. Updated delegation specs/docs and asset tests so Verify-Only Burst uses `adv-verifier` as primary worker and `general` only as unavailable-runtime fallback.
3. Updated active ADV routing surfaces (`adv-apply`, ADV agent instructions, ADV_INSTRUCTIONS, advance-meta spec/docs) to route repeated local verify/test bursts through `adv-verifier` while preserving `adv_run_test` and `adv-ci-waiter` roles.
4. Fixed an existing exhaustive sub-agent report switch gap for `adv-visual-review` so smoke/typecheck passes with the current report union.

## What Was Verified

- Verdict: READY review with 0 blocking findings and 0 issues from `adv-reviewer`.
- Tests: targeted verifier/routing/roster suite passed — 5 files, 156 tests (`tr_mra7pq8q_4f8404e`). Smoke passed — schemas:check, typecheck, lint, format:check, and 57 tests (`tr_mra7ph5s_54f4404e`).
- Preview URL: not_applicable — agreement declared `visual_surface: false`; implementation changes agent prompts, specs, docs, and tests only.
- Contract matrix: 27 required rows passed/respected; 0 failed/violated/unknown.

## Remaining Concerns

No acceptance blockers. Non-blocking release note: live OpenCode sessions will not consume the new repo-owned agent asset until deploy/sync and session restart, per project Source-vs-Dist Reload Gotcha.

## Supporting Evidence

- Tasks/checkpoints: `tk-148bb463d7f7` (`262e3504`), `tk-b4993b7e1563` (`d3c8bd11`), `tk-3c63f8c3a1e2` (`1dc81f36`), `tk-35eaa5466085` (`6ff3791f`).
- Review report: `addAdvVerifier|change:review:acceptance|adv-reviewer|1`, verdict READY.
- Contract proof: review matrix persisted with 27 rows and 0 failing rows.
- Validation: `adv_change_validate strict` passed with warning only `NO_DELTAS`.

## Consequence Context

1. delivered value — pass: dedicated local verifier lane is implemented and source-tested; evidence `adv-verifier` asset + routing/spec tests.
2. enabling-only/follow-up dependency — n/a: no blocking follow-up dependency; deploy/restart is release/deployment operational context, not acceptance blocker.
3. ops readiness — pending: harden/release owns deploy-local/runtime sync verification before archive.
4. migration/data impact — n/a: no persistence/data migration; changes are agent/spec/docs/tests plus a typecheck exhaustiveness fix.
5. frontend/preview impact — n/a: `visual_surface: false`; no browser-visible UI or preview surface.
6. collision/release risk — warning: branch touches ADV global instruction/agent assets and specs; review found no blockers, harden should re-check release collision/sync.
7. open follow-ups — n/a: no required follow-ups or ops obligations recorded.
8. next action — pending: user acceptance proceeds inline to harden/release readiness review.