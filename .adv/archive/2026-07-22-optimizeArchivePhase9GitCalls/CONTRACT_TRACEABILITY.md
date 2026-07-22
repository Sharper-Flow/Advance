# Contract Traceability

**Change ID:** optimizeArchivePhase9GitCalls
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-22T19:05:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Fetch dedup tests in AC7 suite verify ≤1 fetch per invocation; bench reports actual count |
| SC2 | success_criterion | pass | review | Cache eliminates redundant subprocess calls; bench reports ≤12 per invocation |
| SC3 | success_criterion | pass | review | Warn-only bench in git-finalize.bench.test.ts measures ≥30% wall-clock reduction |
| SC4 | success_criterion | pass | review | 122/122 git-finalize.test.ts pass + 44/44 adjacent archive tests + 211 total across 10 files (210 pass, 1 skip) |
| AC1 | acceptance_criterion | pass | test | Existing tests verify identical outcomes before/after cache; no behavior change observed |
| AC2 | acceptance_criterion | pass | test | AC7 cache-hit test verifies repeated queries resolve from FinalizeInvocationState after first call |
| AC3 | acceptance_criterion | pass | test | AC7 tests cover 5 mutation kinds: commitArchiveArtifacts, mergeChangeBranch, pushToOrigin, commitDirtyMainCheckpoint, resetMainToOriginDefault |
| AC4 | acceptance_criterion | pass | test | AC7 failure-rollback test verifies no stale cache entries after mutation throws/aborts |
| AC5 | acceptance_criterion | pass | test | No public function signatures changed; all exports preserved |
| AC6 | acceptance_criterion | pass | test | change.ts:3322 finalizeRelease call site unchanged — no source modification needed |
| AC7 | acceptance_criterion | pass | test | 13 new tests in git-finalize.test.ts: cache hit(1), miss(1), invalidation per mutation(5), rollback(1), fetch dedup(2), e2e(1), undefined-state(1) |
| C1 | constraint | respected | static_check | All existing function signatures preserved; default empty deps produce current behavior |
| C2 | constraint | respected | static_check | No new dependencies added |
| C3 | constraint | respected | static_check | FinalizeInvocationState is sync-only; finalizeRelease remains async only for Phase 9 dispatch |
| C4 | constraint | respected | static_check | Invalidation matrix tested comprehensively in AC7; each mutation has corresponding invalidate call |
| DONT1 | avoidance | respected | review | Sequential finalize flow unchanged; only added accumulator alongside existing calls |
| DONT2 | avoidance | respected | review | No changes to conflict-loop or reconcileChangeBranchWithDefault beyond fetch/route dedup |
| DONT3 | avoidance | respected | review | GitFinalizeOutcome shape unchanged |
| DONT4 | avoidance | respected | review | No gh pr view caching; only git subprocess dedup |
| DONT5 | avoidance | respected | review | No spec changes made |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d7f5e295ad43 | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C3, C4 |  |
| tk-abdddd1da4df | AC7 | AC1, AC2, AC3, AC4 |  |  |
| tk-2175fe9af8bf |  | SC1, SC2, SC3, SC4 |  |  |
