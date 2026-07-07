# Executive Summary

## Outcome
Optimized `adv-ci-waiter` instructions so `oc-ci-wait` owns GitHub API polling/backoff; the sub-agent samples `oc-ci-wait result --watch-id <id> --json` every 20–30 seconds and explicitly distinguishes CI `success` from PR `MERGED`.

## Verdict
APPROVED.

## What Was Built
1. Added repo-owned `.opencode/agents/adv-ci-waiter.md` with explicit polling/cadence/terminal-shape contract; `oc-ci-wait` owns API polling/backoff; sub-agent owns cheap JSON sampling at 20–30s.
2. Updated `.opencode/command/adv-archive.md` Phase 9.5 so CI success and `PR state == MERGED` are split into distinct terminal branches with explicit `gh pr view` PR-state evidence requirement.
3. Updated `rq-releaseFinalization02` and `rq-releaseFinalization04` in `.adv/specs/advance-workflow/spec.json` to encode CI success != PR MERGED and 20–30s sampling ownership.
4. Added `plugin/src/adv-ci-waiter-assets.test.ts` (11 tests) enforcing: repo-owned agent file exists, `mode: subagent`, `oc-ci-wait` ownership, exactly-one-watch, 20–30s cadence, no `sleep 15`, `--watch-id <id> --json` only, CI success != PR MERGED, gh-watch prohibition, bounded output, response shape.
5. Aligned live `~/.config/opencode/instructions/oc-ci-wait.md` and `~/.config/opencode/agents/adv-ci-waiter.md`; synced to `toolbox/backups/dotfiles/opencode/`.

## What Was Verified
- Verdict: APPROVED with 0 findings (5/5 scanner dimensions clean, info-only)
- Tests: bin/oc-test smoke clean (schemas:check, typecheck, lint, format:check); targeted 46/46 (adv-ci-waiter-assets 11/11, archive-release-finalization-assets 4/4, adv-autonomy-quality-assets 31/31)
- TDD: red→green runIds `tr_mra44b6s_24dd53db` → `tr_mra493bm_552668b6`
- Contract matrix: 9/9 rows pass/respected (AC1–AC5, C1–C4)
- Preview URL: not_applicable — change is instruction/text only; no front-end, browser-visible, or visual-output work

## Remaining Concerns
- Live OpenCode agent/instruction files require session restart to take effect.
- Follow-up for /adv-harden: optionally add `adv-ci-waiter` row to the sub-agent policy table in `ADV_INSTRUCTIONS.md` and `.opencode/agents/adv.md` for documentation consistency.

## Consequence Context
- delivered value: pass — Repo-owned adv-ci-waiter prompt + archive Phase 9.5 + spec rq-releaseFinalization02/04 updates + asset tests enforce 20-30s sampling and CI-success != PR-MERGED. Source: contract matrix AC1-AC5 all pass; bin/oc-test smoke clean.
- enabling-only/follow-up dependency: n/a — no enabling-only changes; follow-up is documentation-table addition deferred to harden. Source: agreement scope; no follow-up links.
- ops_readiness: pending — change is text/docs only; production deploys unaffected; harden owns release/deploy readiness. Source: no production-impacting changes.
- migration_data_impact: n/a — no data or schema migrations. Source: contract matrix; no migration surfaces touched.
- frontend_preview_impact: not_applicable — change is instruction/text only; no front-end, browser-visible, or visual-output work. Source: agreement scope + affected files (markdown + asset test).
- collision_release_risk: pass — worktree branch change/optimizeCiWaiter isolated; no scope overlap with other active changes. Source: adv_change_list shows two in-flight changes with no file overlap on touched files.
- open_follow_ups: warning — optional adv-ci-waiter row in sub-agent policy table in ADV_INSTRUCTIONS.md and .opencode/agents/adv.md deferred to /adv-harden for documentation consistency. Source: review observation; not blocking acceptance.
- next_action: pass — user accepts delivered work; inline proceed to /adv-harden optimizeCiWaiter. Source: gate state; acceptance currently pending user approval.