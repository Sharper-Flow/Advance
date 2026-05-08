# Archive: fixTmprl1100NonTerminalReplayFallback

**Change ID:** fixtmprl1100nonterminalreplayf
**Archived:** 2026-05-08T16:36:48.173Z
**Created:** 2026-05-08T05:26:25.517Z

## Tasks Completed

- ✅ Implement non-terminal poisoned-history disk fallback in reseedChangeFromDisk.
  > Task checkpoint completed
- ✅ Add scenario rq-replayFallback01.3 to advance-delivery spec.
  > Task checkpoint completed
- ✅ Full verification pass.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** When retiring a Temporal workflow API (e.g. `defineUpdate` → signal/query collapse), every catch level in the read-fallback chain must recognize replay-class errors, not just the outermost one. The R1 cutover correctly added TMPRL1100 to `classifyTemporalError` AND added disk-projection fallback at the outer query catch AND the inner post-reseed-query catch — but missed the middle `ensureChangeWorkflowStarted` catch. Symptom: read tools work for archived/closed changes (early return) and for cases where re-seed succeeds + post-query fails (line 422 fallback), but fail for non-terminal changes where re-seed itself fails. Fix pattern: in every catch on the recovery chain, pass-through the original `reason` (poisoned_history vs missing_workflow) and gate fallback on it so genuine missing-workflow bugs aren't masked. Test obligation: write a regression test for EACH catch level in the chain, not just one happy-path case.
- **[convention]** Disk-projection fallback discriminator: gate on the resolved `ProjectionRecoveryReason` (`"poisoned_history"` vs `"missing_workflow"`), not on a re-classification of the inner catch's error. The reason is computed once at the call site (`recoveryReasonFromError(originalError)`) and threaded through `reseedChangeFromDisk(changeId, reason)`. Re-classifying inside the catch would (a) duplicate logic, (b) require error propagation that doesn't exist, (c) potentially misclassify when the inner failure is unrelated to the outer trigger. Pattern: thread the resolved classification, gate behavior on it.
