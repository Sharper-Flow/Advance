# Executive Summary

## Outcome

Implemented the critical Phase-9 PR detection fix for issue #202. PR-mode archive finalization now treats squash-merge plus branch auto-delete as a normal release path when structural merged-PR or git proof exists; missing `repo`/`prNumber` metadata is no longer misclassified as an actually unmerged PR.

## Why It Matters

Already-shipped archive PRs can finish the ADV release gate without manually resurrecting deleted branches, while release safety remains fail-closed unless merged PR, default-branch reachability, local merge, or content-addressed tree/tip proof exists.

## Verdict

APPROVED

## What Was Built

1. Added durable Phase-9 `repo` metadata to `Phase9FinalizationStatusSchema` and regenerated public schema output.
2. Added explicit Phase-9 evidence preservation so `repo`, `prNumber`, `prUrl`, `route`, `changeTipSha`, and `autoMergeArmed` survive pending, pending-merge, done, failed, and retry transitions.
3. Updated PR-route release reachability to discover merged PRs when `prNumber` is missing, then confirm PR state before returning release proof.
4. Added `pr_missing_merge_proof` classification so missing metadata or missing proof is distinct from a real unmerged PR.
5. Updated archive retry and release gate blocker paths to use merged PR/default/tip proof before branch-push checks; branch auto-delete no longer blocks a shipped PR archive.
6. Added regression tests for the exact issue #202 failure mode and durable evidence preservation.

## What Was Verified

- Verdict: APPROVED with 0 blocking review findings.
- Tests: changed-scope archive/gate/change suite passed 241/241 (`tr_mrb8zyic_c95f3daa`).
- Static/check gate: `pnpm --dir plugin run check` passed (`tr_mrb8yx44_33a0b150`).
- Prior smoke evidence: `bin/oc-test smoke` passed during execution.
- Preview URL: not_applicable — agreement declares `visual_surface: false`; implementation changes ADV archive/release tool logic only, no browser-visible surface.
- Contract matrix: 27/27 rows passed/respected.
- ADV validation: strict validation passed with one non-blocking `NO_DELTAS` warning.

## Remaining Concerns

- Non-blocking: `bin/oc-test full` failed twice during execution on `src/temporal/__tests__/concurrent-signaling.itest.ts` timeout. Targeted rerun of that same test passed; changed-scope/check/smoke evidence passed. Tracked as unrelated suite-order/contention risk, not a blocker for this change.
- Live ADV MCP behavior requires normal source build, local deploy, and OpenCode/plugin host restart before validation through the running tool host, because current sessions cache deployed `dist`.

## Supporting Evidence

Task checkpoints: `tk-6b5a512d2bd4`, `tk-95a8ba76002e`, `tk-261c0a2ad20f`, `tk-55adf23bc63c`, `tk-38ceecdbb115`. Review scanner bundle: `scanner-bundle:review` attempt 1. Contract matrix persisted with 27 rows and 0 failing rows. Tests: `tr_mrb8zyic_c95f3daa`, `tr_mrb8yx44_33a0b150`, and earlier execution verification noted in task `tk-38ceecdbb115`.

## Consequence Context

1. delivered value — pass: critical archive finalizer bug fixed; shipped PR archives can complete release gate after branch auto-delete when merged PR/default/tip proof exists.
2. enabling-only/follow-up dependency — warning: unrelated full-suite concurrent-signaling timeout is tracked separately; no required follow-up blocks this fix.
3. ops readiness — pass: no migrations, env vars, external services, or GitHub setting changes.
4. migration/data impact — low: optional `phase9_status.repo` is additive; existing statuses remain valid.
5. frontend/preview impact — n/a: agreement `visual_surface: false`; no visual/browser surface.
6. collision/release risk — medium-low: archive/gate behavior changed, but targeted regression coverage, schema/check, smoke, and review passed.
7. open follow-ups — non-blocking agenda follow-up `ag-RWLCu8GU` monitors unrelated full-suite timeout; no release blocker from this change.
8. next action — user acceptance proceeds inline to harden/release.