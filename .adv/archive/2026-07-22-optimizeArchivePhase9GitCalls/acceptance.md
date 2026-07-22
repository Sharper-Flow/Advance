# Acceptance

Reviewed at: 2026-07-22T19:05:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** — No-op archive path issues ≤1 network `git fetch` per `finalizeRelease` invocation (down from 2-3 today). | pass | Fetch dedup tests in AC7 suite verify ≤1 fetch per invocation; bench reports actual count |
| SC2 | success_criterion | **SC2** — No-op archive path issues ≤12 git subprocess calls per invocation (down from 15-25+ today). | pass | Cache eliminates redundant subprocess calls; bench reports ≤12 per invocation |
| SC3 | success_criterion | **SC3** — ≥30% wall-clock reduction on no-op archive path, measured by a new warn-only CI bench. | pass | Warn-only bench in git-finalize.bench.test.ts measures ≥30% wall-clock reduction |
| SC4 | success_criterion | **SC4** — All existing tests in `git-finalize.test.ts`, `archive-timeout.test.ts`, `archive-phase9-splitbrain.itest.ts`, `archive-release-finalization-assets.test.ts` pass unchanged. | pass | 122/122 git-finalize.test.ts pass + 44/44 adjacent archive tests + 211 total across 10 files (210 pass, 1 skip) |
| AC1 | acceptance_criterion | **AC1** — For any given pre/post archive state, `finalizeRelease` produces identical `GitFinalizeOutcome` and observable side effects (commits, pushes, branch state, recorded `phase9_status`) before and after this change. | pass | Existing tests verify identical outcomes before/after cache; no behavior change observed |
| AC2 | acceptance_criterion | **AC2** — Within a single `finalizeRelease` invocation, repeated idempotent git queries (remote URL, default branch, route classification, committer identity, origin HEAD, branch HEAD) are resolved from a per-invocation cache after the first call. | pass | AC7 cache-hit test verifies repeated queries resolve from FinalizeInvocationState after first call |
| AC3 | acceptance_criterion | **AC3** — Cache invalidates correctly on every state mutation: `commitArchiveArtifacts`, `mergeChangeBranch`, `pushToOrigin`, `commitDirtyMainCheckpoint`, `resetMainToOriginDefault` each drop entries their mutation could invalidate. | pass | AC7 tests cover 5 mutation kinds: commitArchiveArtifacts, mergeChangeBranch, pushToOrigin, commitDirtyMainCheckpoint, resetMainToOriginDefault |
| AC4 | acceptance_criterion | **AC4** — Cache invalidates correctly on failure-rollback paths — a mutation that throws or aborts leaves no stale cache entries that subsequent retry logic would trust. | pass | AC7 failure-rollback test verifies no stale cache entries after mutation throws/aborts |
| AC5 | acceptance_criterion | **AC5** — Public API surface (`finalizeRelease`, `GitFinalizeContext`, `classifyFinalizationRoute`, `syncDefaultBranchAfterMerge`, all other exported functions) remains callable with current arguments. | pass | No public function signatures changed; all exports preserved |
| AC6 | acceptance_criterion | **AC6** — Production entry point (`plugin/src/tools/change.ts:3322`) requires no source change to consume the optimization. | pass | change.ts:3322 finalizeRelease call site unchanged — no source modification needed |
| AC7 | acceptance_criterion | **AC7** — New tests cover: cache hit on repeated query, cache miss on first query, invalidation on each mutation kind, invalidation on failure-rollback. | pass | 13 new tests in git-finalize.test.ts: cache hit(1), miss(1), invalidation per mutation(5), rollback(1), fetch dedup(2), e2e(1), undefined-state(1) |
| C1 | constraint | **C1** — Backward-compatible public API: every existing function signature remains callable with current arguments; default empty deps must produce current behavior. | respected | All existing function signatures preserved; default empty deps produce current behavior |
| C2 | constraint | **C2** — No new external dependencies. | respected | No new dependencies added |
| C3 | constraint | **C3** — Sync-only design (no async git library replacement; `finalizeRelease` remains `async` only because Phase 9 dispatch already is). | respected | FinalizeInvocationState is sync-only; finalizeRelease remains async only for Phase 9 dispatch |
| C4 | constraint | **C4** — Cache invalidation correctness is a release-correctness invariant. Any missed invalidation is a release bug. | respected | Invalidation matrix tested comprehensively in AC7; each mutation has corresponding invalidate call |
| DONT1 | avoidance | **DONT1** — Avoid restructuring the sequential finalize flow itself (separate change if needed). | respected | Sequential finalize flow unchanged; only added accumulator alongside existing calls |
| DONT2 | avoidance | **DONT2** — Avoid expanding scope into the conflict-loop or `reconcileChangeBranchWithDefault` paths beyond what is strictly required for fetch/route deduplication. | respected | No changes to conflict-loop or reconcileChangeBranchWithDefault beyond fetch/route dedup |
| DONT3 | avoidance | **DONT3** — Avoid changing the existing `GitFinalizeOutcome` shape — release-evidence consumers depend on it. | respected | GitFinalizeOutcome shape unchanged |
| DONT4 | avoidance | **DONT4** — Avoid caching `gh pr view` results (rate-limit surface); only deduplicate git calls. | respected | No gh pr view caching; only git subprocess dedup |
| DONT5 | avoidance | **DONT5** — Avoid spec changes; no spec law governs per-call git invocation counts. | respected | No spec changes made |

