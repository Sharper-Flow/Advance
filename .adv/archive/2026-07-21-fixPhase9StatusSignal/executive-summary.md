# Executive Summary

## Outcome

Archive release-gate signal processing no longer races with the cache refresh that follows it. `completeReleaseGateAfterFinalization` defers `store.changes.refresh(changeId)` until AFTER `waitForArchiveReleaseGateCompletion` observes done, so the refresh's readback query returns post-signal state instead of pre-signal state. The recurring `rq-releaseProjectionDurability01` wedge that forced manual `adv_gate_complete` recovery on every archive is eliminated.

## Value

Before this change, every `adv_change_archive phase9:"run"` could wedge with `Store-backed durable release gate proof did not observe release done` even when Phase 9 git work shipped cleanly, the merge was on `origin/trunk`, and the archive bundle was written to disk. Observed twice in one session (archives of `fixSlopScanResolverTimeouts` and `makeWorkspaceCleanupRemoteFail`). The only recovery was manual `adv_gate_complete gateId:"release"` with compatibility+recovery evidence — a workaround that defeated the entire automation goal. The structural root cause — a Temporal signal-processing race — is now closed at the implementation level.

## What Changed

- `plugin/src/tools/change/archive-gate.ts`: `await input.store.changes.refresh(input.changeId)` moved from inside the signal-success try block (before `waitForArchiveReleaseGateCompletion`) to AFTER the poll observes `status === "done"`. Inline comment cites the change ID and explains the race rationale.
- `plugin/src/tools/change/archive-gate.test.ts`: new regression test in a dedicated describe block (`completeReleaseGateAfterFinalization — refresh-after-poll race fix`). Uses invocation-order tracking to assert that refresh is called AFTER at least one query returned `doneGate`. The refresh mock consumes an actual query to model real refresh readback behavior.

## Discovery trail

The original backlog hypothesis (`bl-HHQKHGug`) was that `recordPhase9Status` used blind-retry `fireSignalAndRefresh` and needed the T3 idempotent-reconcile pattern. Discovery refuted this: `recordPhase9Status` records phase9 metadata, not gate state, and is independent of `verifyReleaseGateDurableForArchive`. A second preliminary hypothesis (T3 single-fire skipped cache refresh) was also refuted: the refresh IS called. The actual root cause — post-mutation readback racing with workflow signal processing — was locked via code trace through `dualWriteAfterMutation`. The adv-researcher design validator caught a critical flaw in the originally-proposed Option 3 (skip refresh), which would have shipped a non-fix; the revised approach (move refresh) was the validator's recommendation.

## Verification

- Targeted suite `archive-gate.test.ts`: **13 pass / 0 fail** (`tr_mrtypdp6_07cb956b`).
- Combined `archive-gate.test.ts` + `archive-phase9.test.ts`: **48 pass / 0 fail** (`tr_mrtykurw_52c1c527`).
- Broader regression `src/tools/change/` + `src/storage/store-temporal/`: **pass / 0 fail** (`tr_mrtylgsc_42cbdbc4`).
- TDD red→green: `tr_mrtyk6lp_be186b9a` (1 fail) → `tr_mrtykurw_52c1c527` (48 pass).
- Independent acceptance review: **READY**, scoped remediation applied (refresh mock consumes a query to model real readback; query sequence tightened).
- Contract matrix: 17 rows (16 pass + 1 not_applicable due to obsolete Option 3 framing); 0 failures.
- adv-researcher design validator: caught Option 3 flaw during discovery; design rev 2 incorporated correction.

## Remaining Behavior

- The T3 single-fire + reconcile-on-ambiguous-failure pattern in `completeReleaseGateAfterFinalization` is unchanged.
- The disk-projection recovery path (`recoverReleaseGateIfWorkflowCompleted`) is unchanged.
- `recordPhase9Status` is unchanged — discovery confirmed it is not the root cause.
- `dualWriteAfterMutation` shared infrastructure is unchanged; only its caller invocation site moved.
- The manual `adv_gate_complete gateId:"release"` recovery escape hatch remains for genuine edge cases.

## Risks and Follow-ups

No release blocker. The fix is narrow (one relocated line + comment + one regression test). End-to-end validation requires deploy + OpenCode restart; until then, the deployed plugin still exhibits the wedge. After deploy, the next archive on this repository should converge without manual recovery.

The broader #255 vision (self-healing projections / reconciliation loop) remains the strategic umbrella for archive reliability; this change is the tactical patch within the current architecture.

## Contract note

AC2 and AC7 were minted before the adv-researcher CONFLICT review. AC2's letter mentions "Option 3 preferred" (skip refresh); AC7 anticipates a `rq-cacheRefresh01-exempt` documentation requirement. Both were rendered obsolete when the validator proved Option 3 doesn't close the race. The actual fix (move refresh) satisfies the SPIRIT of AC2 (no stale state written) without its letter. AC7 is marked `not_applicable` because no exemption is needed — `rq-cacheRefresh01` is still honored; refresh still happens after the mutation.