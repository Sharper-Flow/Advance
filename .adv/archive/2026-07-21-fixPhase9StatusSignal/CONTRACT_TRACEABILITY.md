# Contract Traceability

**Change ID:** fixPhase9StatusSignal
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T01:16:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Race fix moves refresh after poll; tk-4e678e843775 regression test asserts the sequencing invariant. Targeted tr_mrtypdp6_07cb956b: 13 pass. Broader regression tr_mrtylgsc_42cbdbc4 (change/ + store-temporal/). End-to-end archive reproducer is pending deploy + restart; unit-level proof is the regression test. |
| AC2 | acceptance_criterion | pass | test | tk-61403e8f7e0e moved store.changes.refresh from before-poll to after-poll in archive-gate.ts. No stale pre-signal state can be cached via refresh because refresh now runs after the workflow has confirmed done. AC2's letter mentions Option 3 (skip); actual fix is move-not-skip per adv-researcher CONFLICT. Spirit satisfied; letter superseded by validator correction. |
| AC3 | acceptance_criterion | pass | test | waitForArchiveReleaseGateCompletion unchanged in source; remains the authoritative post-signal check. Existing T3 tests at archive-gate.test.ts:421-549 still pass. |
| AC4 | acceptance_criterion | pass | test | tk-4e678e843775 regression test simulates pending-then-done query sequence and asserts refresh runs after at least one query returned doneGate. Reviewer remediation made the refresh mock consume an actual query to model real refresh readback. tr_mrtypdp6_07cb956b: 13 pass. |
| AC5 | acceptance_criterion | pass | test | With the fix, refresh's readback query consumes a post-done result (refresh mock in regression test models this). No pre-signal pending state can be cached or persisted via the refresh path. tk-4e678e843775 covers this via invocation-order assertion. |
| AC6 | acceptance_criterion | pass | test | Existing tests in archive-gate.test.ts and archive-phase9.test.ts continue to pass (48 pass in tr_mrtykurw_52c1c527 before reviewer fix; 13 pass in tr_mrtypdp6_07cb956b after reviewer fix on narrowed scope). Broader change/ + store-temporal/ suite: pass (tr_mrtylgsc_42cbdbc4). |
| AC7 | acceptance_criterion | not_applicable | test | AC7 was rendered obsolete by adv-researcher CONFLICT review during discovery: the actual fix moves refresh (not skips it), so no rq-cacheRefresh01 exemption is needed. AC7's premise (Option 3 chosen) is false. Inline comment in archive-gate.ts documents the fix rationale and cites fixPhase9StatusSignal change ID without claiming an exemption. |
| C1 | constraint | respected | static_check | No new public ADV tool introduced. |
| C2 | constraint | respected | static_check | No blind-retry reintroduced; refresh remains single-call. |
| C3 | constraint | respected | static_check | phase9StatusUpdatedSignal, gateCompletedSignal, changeStateQuery payload schemas unchanged. |
| C4 | constraint | respected | static_check | rq-releaseProjectionDurability01 spec body unchanged; implementation now actually satisfies it. |
| C5 | constraint | respected | static_check | recordPhase9Status unchanged (discovery confirmed it is not the root cause). |
| C6 | constraint | respected | static_check | T3 single-fire pattern unchanged in completeReleaseGateAfterFinalization; only the refresh call location moved. |
| C7 | constraint | respected | static_check | adv-researcher validator ran during discovery and caught the Option 3 flaw; design rev 2 incorporates the correction. Reviewer READY acceptance verdict confirms. |
| DONT1 | avoidance | respected | review | isAmbiguousReleaseGateSignalFailure unchanged; T3 reconcile path preserved. |
| DONT2 | avoidance | respected | review | dualWriteAfterMutation unchanged; only the caller invocation site moved. |
| DONT3 | avoidance | respected | review | No unrelated archive reliability work bundled; diff is 2 files (archive-gate.ts + archive-gate.test.ts). |
| DONT4 | avoidance | respected | review | adv-researcher ran during discovery; validator verdict CONFLICT was resolved in design rev 2. |
| DONT5 | avoidance | respected | review | Design commits to one option (move refresh) with rationale referencing validator findings. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-61403e8f7e0e | AC1, AC2, AC3 | AC4, AC6 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-4e678e843775 |  | AC1, AC4, AC5, AC6, AC7 |  | AC7 anticipated a rq-cacheRefresh01 exemption under Option 3 (skip refresh). adv-researcher CONFLICT review during discovery proved Option 3 does not close the race. Actual fix moves refresh (not skips); rq-cacheRefresh01 is still honored; no exemption needed. AC7's premise is false; inline comment in archive-gate.ts documents the move rationale and cites fixPhase9StatusSignal without claiming an exemption. |
