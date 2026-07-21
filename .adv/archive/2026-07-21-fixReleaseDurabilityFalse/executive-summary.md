# Executive Summary

## Outcome

`adv_change_archive` now archives genuinely-shipped changes on the first call instead of producing a false-negative that forced a manual `adv_change_status_repair`. The approver is deciding whether to ship this release-durability fix.

## Why It Matters

This exact false-negative fired 3× consecutively earlier today (PRs #278, #281, #282), each requiring an operator round-trip through `status_repair`. It's a recurring tax on every admin/squash-merge release and a documented instance of the `hardenTemporalReliability` Epic's target invariant #4 ("durability proofs reconcile against the authoritative workflow instead of fail-closing against staleness"). The fix removes one of the recovery-tool triggers issue #255 aims to retire.

## Verdict

APPROVED

## What Was Built

1. **Authoritative-state reconciliation** — `verifyReleaseGateDurableForArchive` gains an optional `finalizationShipped` flag. When the release gate is `done` and the archive's fresh git finalization reports `status: "shipped"`, the durable proof is accepted even if the stored gate evidence doesn't substring-match the structured completion evidence. The evidence-string path is preserved for archive-completed gates (backward compatible).
2. **Call-site wiring** — all 3 production callers (`archive-gate.ts:407,443`, `change.ts:3486`) pass `finalizationShipped: finalization.status === "shipped"`.
3. **Guard preserved** — the disk-projection/poisoned-history recovery path is untouched; a change whose finalization is not shipped still fails the proof.

## What Was Verified

- Verdict: APPROVED, 0 findings. TDD red (AC4 + squash-regression fail, tr_mrvavah1) → green (tr_mrvaz2er).
- **Safety proof**: `finalization.status === "shipped"` is returned by `git-finalize.ts` only on confirmed reachability/merge (PR `pr_merged` at 1739/2363; `no_remote` local merge at 3034; direct merge+push at 3054). `shipped` ⟹ the change reached the default branch, so gating on it cannot accept an unshipped change (SC2/AC2/C1/DONT1).
- Tests: 41/41 `change.archive-phase9`, 155/155 `archive-gate` + `change`; `pnpm run check` green. An AC2 guard-preservation test explicitly asserts unshipped + non-matching evidence still blocks.
- Preview URL: not_applicable — internal archive tooling.
- Contract matrix: 13 rows (2 SC + 5 AC + 3 C + 3 DONT), 0 failing.

## Remaining Concerns

None blocking. The pre-existing `blocks existing-bundle retry` integration test encoded the false-negative (shipped change + no matching evidence) and was updated to assert the corrected success behavior; guard preservation is covered by the AC2 unit test and the upstream finalization-status check.

## Supporting Evidence

- Task tk-5b1c4b51a8a1 (done, checkpoint 779d91a1).
- 3 files: `plugin/src/tools/change/archive-gate.ts`, `plugin/src/tools/change.ts`, `plugin/src/tools/change.archive-phase9.test.ts`.
- Contract review matrix: 13 rows, 0 failing.
- Issue #255 comment documents the 3 reproductions; `bl--1Jm4pMx`; Epic order-7 shell.

## Consequence Context

1. Delivered value: eliminates the recurring release-archive false-negative + `status_repair` operator round-trip on admin/squash merges.
2. Enabling-only/follow-up dependency: none; complements (does not depend on) `replaceRecoveryToolSprawl` (#255).
3. Ops readiness: ready — standard plugin rebuild; no migrations/config.
4. Migration/data impact: n/a — additive optional parameter; default preserves prior behavior.
5. Frontend/preview impact: not_applicable.
6. Collision/release risk: low. Touches archive-gate.ts + change.ts; `replaceRecoveryToolSprawl` (order-9, in flight) touches recovery tools/task.ts — different functions. `optimizeArchivePhase9GitCalls` touches git-call count, not the evidence matcher.
7. Open follow-ups: none. This closes the order-7 Epic shell durability-guard scope for the false-negative class.
8. Next action: acceptance approval proceeds inline to push + merge + archive.