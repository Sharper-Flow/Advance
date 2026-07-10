# Contract Traceability

**Change ID:** fixDirectArchiveMerge
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-10T20:15:03.849Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Direct phase9:run routes through awaited finalization; returns terminal shipped/pending_merge/blocked/failed. Reviewer READY attempt 2 confirmed no silent pending; change.ts:2630-2688. |
| SC2 | success_criterion | pass | review | Affected archives recover via reconcileArchivedBundleRetry (archive-gate.ts:238) + idempotent re-entry, revalidating origin/default proof before release. Reviewer confirmed AC4 path preserved. |
| AC1 | acceptance_criterion | pass | test | change.archive-phase9.test.ts synchronous-finalization tests: shipped recorded only after finalizeRelease reachability; 34/34 pass. |
| AC2 | acceptance_criterion | pass | test | New AC2 test: thrown finalization records durable phase9_status:failed via preservePhase9Evidence and returns actionable rq-releaseFinalization01 error; no archive save. RED tr_mrfd2p9a → GREEN tr_mrfd484u. |
| AC3 | acceptance_criterion | pass | test | Interruption window eliminated; no residual phase9_status:pending on return. Verified by no-residual-pending assertions in change.archive-phase9.test.ts. |
| AC4 | acceptance_criterion | pass | test | reconcileArchivedBundleRetry revalidates trunk evidence via verifyReleaseEvidenceFromMain before completing release; archive-gate.test.ts recovery coverage green in full suite. |
| AC5 | acceptance_criterion | pass | test | PR-mode pending_merge and #198 recovery paths untouched; reviewer verified boundaries; full suite 4825/4827 (2 unrelated transient flakes). |
| C1 | constraint | respected | static_check | Existing origin/default-branch and merged-PR proof in finalizeRelease/verifyReleaseGateDurableForArchive unchanged; rq-releaseFinalization01 extended, not weakened. |
| C2 | constraint | respected | static_check | Changes confined to tool-layer change.ts (imports Store); no workflow-bundle/signal-query surface modified. workflow-bundle-boundary test green. |
| C3 | constraint | respected | static_check | success:false returned on blocked/failed/pending paths before archive status transition; no early success. Ordering finalization→gate→durable proof→archive preserved. |
| DONT1 | avoidance | respected | review | phase9-queue.ts fire-and-forget module deleted; direct merge work awaited inline. |
| DONT2 | avoidance | respected | review | try/catch records durable failed status and returns actionable error; no swallowed failure (.catch(()=>{}) removed). |
| DONT3 | avoidance | respected | review | No automatic retry added; recovery is explicit operator re-invocation. |
| OOS1 | out_of_scope | not_applicable | not_applicable | PR-mode defects #202/#203 not touched. |
| OOS2 | out_of_scope | not_applicable | not_applicable | #198 wedged-workflow recovery not touched. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Async branch-cleanup warning parity not addressed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1fdf4c678181 | SC1, AC1, AC2, AC3 |  | C1, C2, C3, DONT1, DONT2, DONT3, OOS1, OOS2 |  |
| tk-789feaca52c2 | C1 |  | C2, C3, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-a716bf9a25e2 |  | SC1, SC2, AC1, AC2, AC3, AC4, AC5, C1, C3 | DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-593d5838e082 |  |  |  | Campsite scope authorized by user after full-suite verification: align stale asset expectations with already-current spec versions and requirement lists; no change to the approved direct-archive contract. |
