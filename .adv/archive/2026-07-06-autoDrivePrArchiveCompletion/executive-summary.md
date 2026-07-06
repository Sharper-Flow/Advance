# Executive Summary

## Outcome
APPROVED. The pending-PR archive path now self-completes via the new `syncDefaultBranchAfterMerge` pure helper in `plugin/src/tools/archive-helpers/git-finalize.ts` and the Phase 9.5 orchestration section in `.opencode/command/adv-archive.md`. Auto-spawns `adv-ci-waiter` on the `pr_auto_merge` / `merge_queue` hand-back path, waits for `MERGED`, syncs local default branch via fetch + ff-only-or-surface, then re-calls `adv_change_archive` to drive `Shipped.` via `verifyReleaseEvidenceFromMain`. End-to-end with no second human turn.

## Verdict
APPROVED with all review remediations applied.

## What Was Built
1. `syncDefaultBranchAfterMerge` helper in `plugin/src/tools/archive-helpers/git-finalize.ts` (~130 lines). Pure `runGit`-injected, mirrors `reconcileChangeBranchWithDefault`. Performs `git fetch` + `rev-list --count` divergence check + `merge --ff-only` on clean path. Returns `synced` / `diverged` / `blocked` with structured remediation messages. 5 unit tests cover the common path, diverged-surface path, fetch-failure path, destructive-ops spy, and type-shape guard.
2. Phase 9.5 "Auto-Drive Pending-PR Archive Completion" section in `.opencode/command/adv-archive.md` (~30 lines). Reads nested `finalization.*` fields from the archive tool's `pending_merge` return, spawns `adv-ci-waiter` via Task tool, branches on terminal state (MERGED: call helper + re-call archive; non-terminal: leave active with retry command).
3. Three new spec rules rq-releaseFinalization02 (4 scenarios) / .03 (4 scenarios) / .04 (2 scenarios) in `.adv/specs/advance-workflow/spec.json` (advance-workflow bump 1.25.0 → 1.25.1).
4. 8 new tests across the helper, regression guards, and command-section assert. 96 tests total in `git-finalize.test.ts`.
5. Three targeted remediation fixes applied at review time (commit 6a68b8a2): strict rev-list status check + `^\d+$` parsing (ce-1), `MAIN_NOT_ON_DEFAULT` structural guard via `git rev-parse --abbrev-ref HEAD` (ce-2), and extension of destructive-ops spy to the merge path (ce-3).
6. One docstring consistency fix (commit beca5a22): `adv_ci_waiter` → `adv-ci-waiter` to keep tool-name allowlist clean.

## What Was Verified
- Verdict: APPROVED after three review findings remediated (commits 6a68b8a2 + beca5a22)
- Tests: 4610 passed / 0 failures introduced by this change (1 pre-existing failure: `adv_backed_fact` classification label in `adv-coordinate.md` from 2026-07-05, unrelated)
- Targeted areas: 96 tests in `git-finalize.test.ts` all green; `src/temporal/workflow-bundle-boundary.test.ts` green (no worker-bundle boundary regressions)
- Preview URL: `not_applicable` — backend-only change (no front-end, browser-visible, or visual output). Confirmed in agreement.md `preview_expectation: not_applicable`; `visual_surface: false`.
- Contract matrix: 21 rows persisted, 0 failing. Required rows passed (SC1-3, AC1-7, C1-6, DONT1-5). Remediation delta rows for ce-1/ce-2/ce-3 re-verified.

## Remaining Concerns
None at acceptance time. Two follow-ups deferred to `/adv-harden` for validation and tracking (not blocking acceptance):
- `ce-4` (suggestion) — TOCTOU branch (`merge --ff-only` fails after rev-list reports clean) has zero direct test coverage; harmless when surfaced as `FF_MERGE_FAILED`, would benefit from a mock-runGit test.
- `ce-5` (suggestion) — already-in-sync no-op path (`ahead==0 && behind==0`, `ffCommits:[]`) lacks a dedicated test case; minor coverage gap.
- `ct-1` (issue, known limitation) — 5/21 contract items (AC1, AC5, SC1, SC3, C2) rely on prose-orchestration in `adv-archive.md` Phase 9.5 with no runtime agent-harness integration test. Documented as a design constraint in the agreement; future fast-follow could add contract-traceability doc or agent harness.

## Consequence Context
1. delivered value — Pending-PR archive path now self-completes: auto-spawn `adv-ci-waiter`, wait for `MERGED`, fetch + ff-only trunk sync (or surface divergence without mutation), then re-call archive tool to drive `Shipped.`. Eliminates the manual re-invocation loop that left change wedged in `Pending auto-merge.`. Source: `git-finalize.ts:184-282`, `adv-archive.md:506-533`, contract matrix SC1-3.
2. enabling-only/follow-up dependency — None new. Fast-follow of `fixPhase9SquashMergeRedetect` (P1 P2 split in parent change deferred Q to a separate issue); this change consumes the parent's persisted tip-SHA proof path via `verifyReleaseEvidenceFromMain` unchanged.
3. ops readiness — `pending`. No ops work needed for archive workflow itself; harden owns release/deploy/production/docs/cleanup readiness. Evidence: no `ops_followup` profile on this change; archive already owns its phase9 finalization helpers.
4. migration/data impact — `n/a`. No data model migration. `phase9_status.changeTipSha` (parent) and `PR_AUTO_MERGE` route flow are unchanged. Evidence: helper is purely additive; no existing function signature modified.
5. frontend/preview impact — `Preview URL: not_applicable`. Backend-only ADV plugin change; no visual surface, no front-end component, no browser-visible output. Evidence: agreement.md `visual_surface: false`; `preview_expectation: not_applicable`.
6. collision/release risk — None. Five commits on `change/autoDrivePrArchiveCompletion` branch; no advances made to remote. Merge queue and auto-merge spec fields unchanged at the route layer.
7. open follow-ups — Three non-blocking items above (ce-4 TOCTOU test, ce-5 no-op sync test, ct-1 prose-orchestration harness) tracked for `/adv-harden` validation.
8. next action — Acceptance approval proceeds inline to `/adv-harden autoDrivePrArchiveCompletion` for release hardening + archive finalization.