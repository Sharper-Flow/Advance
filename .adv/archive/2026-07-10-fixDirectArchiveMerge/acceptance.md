# Acceptance

Reviewed at: 2026-07-10T20:15:03.849Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | A direct archive request reaches a durable terminal finalization state of shipped or failed before its completion is reported. | pass | Direct phase9:run routes through awaited finalization; returns terminal shipped/pending_merge/blocked/failed. Reviewer READY attempt 2 confirmed no silent pending; change.ts:2630-2688. |
| SC2 | success_criterion | An archive affected by the prior direct-finalization defect can complete release through supported recovery after default-branch proof is available. | pass | Affected archives recover via reconcileArchivedBundleRetry (archive-gate.ts:238) + idempotent re-entry, revalidating origin/default proof before release. Reviewer confirmed AC4 path preserved. |
| AC1 | acceptance_criterion | Given a direct archive whose merge succeeds, when finalization completes, then it records shipped evidence and completes release only after default-branch reachability verification. | pass | change.archive-phase9.test.ts synchronous-finalization tests: shipped recorded only after finalizeRelease reachability; 34/34 pass. |
| AC2 | acceptance_criterion | Given direct finalization throws, when finalization handles the error, then it records failed with actionable recovery evidence and leaves no silent pending state. | pass | New AC2 test: thrown finalization records durable phase9_status:failed via preservePhase9Evidence and returns actionable rq-releaseFinalization01 error; no archive save. RED tr_mrfd2p9a → GREEN tr_mrfd484u. |
| AC3 | acceptance_criterion | Given processing is interrupted after dispatch, when processing resumes, then finalization reaches durable shipped or failed state rather than losing merge work. | pass | Interruption window eliminated; no residual phase9_status:pending on return. Verified by no-residual-pending assertions in change.archive-phase9.test.ts. |
| AC4 | acceptance_criterion | Given manual merge/push recovery for an affected archive, when supported recovery runs, then it revalidates trunk evidence and completes release. | pass | reconcileArchivedBundleRetry revalidates trunk evidence via verifyReleaseEvidenceFromMain before completing release; archive-gate.test.ts recovery coverage green in full suite. |
| AC5 | acceptance_criterion | Given PR-mode finalization or #198 wedged-workflow recovery, when this change is applied, then existing behavior remains unchanged. | pass | PR-mode pending_merge and #198 recovery paths untouched; reviewer verified boundaries; full suite 4825/4827 (2 unrelated transient flakes). |
| C1 | constraint | Preserve the existing origin/default-branch or merged-PR proof enforced by `rq-releaseFinalization01`. | respected | Existing origin/default-branch and merged-PR proof in finalizeRelease/verifyReleaseGateDurableForArchive unchanged; rq-releaseFinalization01 extended, not weakened. |
| C2 | constraint | Keep Temporal behavior replay-safe and preserve the signal/query-only change-workflow surface. | respected | Changes confined to tool-layer change.ts (imports Store); no workflow-bundle/signal-query surface modified. workflow-bundle-boundary test green. |
| C3 | constraint | A direct archive must not be reported as successfully released before terminal finalization evidence exists. | respected | success:false returned on blocked/failed/pending paths before archive status transition; no early success. Ordering finalization→gate→durable proof→archive preserved. |
| DONT1 | avoidance | Do not detach direct merge work behind a fire-and-forget promise. | respected | phase9-queue.ts fire-and-forget module deleted; direct merge work awaited inline. |
| DONT2 | avoidance | Do not swallow direct-finalization failures. | respected | try/catch records durable failed status and returns actionable error; no swallowed failure (.catch(()=>{}) removed). |
| DONT3 | avoidance | Do not add automatic retry behavior. | respected | No automatic retry added; recovery is explicit operator re-invocation. |
| OOS1 | out_of_scope | PR-mode finalization defects tracked in #202 and #203. | not_applicable | PR-mode defects #202/#203 not touched. |
| OOS2 | out_of_scope | Live wedged-workflow recovery defect tracked in #198. | not_applicable | #198 wedged-workflow recovery not touched. |
| OOS3 | out_of_scope | Async branch-cleanup warning parity; it is a distinct observability issue, not #214's causal path. | not_applicable | Async branch-cleanup warning parity not addressed. |

