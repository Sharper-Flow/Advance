# Contract Traceability

**Change ID:** fixSquashMergeRelease
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-09T22:16:32.211Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Lines 1725-1745: squash-merge fallback in direct route branch, guarded by input.prNumber && route.repo |
| AC2 | acceptance_criterion | pass | test | Lines 1733-1744: returns { reachable: true, proof: 'pr_merged', prNumber, mergeCommitOid } when state=MERGED and mergedAt present |
| AC3 | acceptance_criterion | pass | test | Lines 1747-1751: falls through to origin_unmerged when PR not merged or error |
| AC4 | acceptance_criterion | pass | test | Line 1726: input.prNumber guard skips fallback when unavailable |
| AC5 | acceptance_criterion | pass | test | Line 1726: route.repo guard skips fallback when unavailable |
| AC6 | acceptance_criterion | pass | test | 3604 tests pass, no existing test modifications for non-squash paths |
| AC7 | acceptance_criterion | pass | test | 4 new unit tests in git-finalize.test.ts: squash-merged fallback, no prNumber, PR not merged, gh failure |
| SC1 | success_criterion | pass | review | Integration test in gate.release-enforcement.test.ts mocks squash-merged PR scenario, verifies gate completion |
| SC2 | success_criterion | pass | review | Full test suite: 3604 tests pass (269 files) |
| SC3 | success_criterion | pass | review | pnpm run check: schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check all green |
| C1 | constraint | respected | static_check | Reuses readPrMergeState at line 967, no duplication |
| C2 | constraint | respected | static_check | Uses existing pr_merged proof from ReleaseReachabilityProof at line 81 |
| C3 | constraint | respected | static_check | No changes to classifyFinalizationRoute or detectArchiveMode |
| C4 | constraint | respected | static_check | No changes to getReleaseFinalizationBlocker in gate.ts |
| DONT1 | avoidance | respected | review | No new proof type added, pr_merged already existed |
| DONT2 | avoidance | respected | review | No changes to ReleaseReachabilityInput interface |
| DONT3 | avoidance | respected | review | gh call only in fallback path after ancestry fails (line 1727) |
| DONT4 | avoidance | respected | review | No Phase 9 git finalization modifications |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-60fceef68814 |  | AC1, AC2, AC3, AC4, AC5, AC7 |  |  |
| tk-d313bce838cc | AC1, AC2, AC3, AC4, AC5 |  |  |  |
| tk-cd67fbeffbd0 |  | AC1, SC1 |  |  |
| tk-6145dd2688e0 |  | AC1, SC1 |  |  |
| tk-7d05b20acefc |  | SC2, SC3, AC6 |  |  |
| tk-13774c51b06e |  | SC2, SC3 |  |  |
