# Acceptance

Reviewed at: 2026-06-09T22:16:32.211Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1**: When route is `"direct"`, ancestry fails, and `prNumber` + `route.repo` are available, `resolveReleaseReachability` checks PR merge state as fallback | pass | Lines 1725-1745: squash-merge fallback in direct route branch, guarded by input.prNumber && route.repo |
| AC2 | acceptance_criterion | **AC2**: If PR shows `state: "MERGED"` with `mergedAt`, returns `{ reachable: true, proof: "pr_merged", prNumber, mergeCommitOid }` | pass | Lines 1733-1744: returns { reachable: true, proof: 'pr_merged', prNumber, mergeCommitOid } when state=MERGED and mergedAt present |
| AC3 | acceptance_criterion | **AC3**: If PR is not merged, returns the original `{ reachable: false, proof: "origin_unmerged" }` (no behavior change) | pass | Lines 1747-1751: falls through to origin_unmerged when PR not merged or error |
| AC4 | acceptance_criterion | **AC4**: If `prNumber` is unavailable, returns the original `{ reachable: false, proof: "origin_unmerged" }` (no behavior change) | pass | Line 1726: input.prNumber guard skips fallback when unavailable |
| AC5 | acceptance_criterion | **AC5**: If `route.repo` is unavailable, returns the original `{ reachable: false, proof: "origin_unmerged" }` (no behavior change) | pass | Line 1726: route.repo guard skips fallback when unavailable |
| AC6 | acceptance_criterion | **AC6**: All existing tests pass unchanged — no test modifications needed for non-squash paths | pass | 3604 tests pass, no existing test modifications for non-squash paths |
| AC7 | acceptance_criterion | **AC7**: New tests cover: squash-merged PR fallback (pass), no prNumber (no fallback), PR not merged (no fallback), no repo (no fallback) | pass | 4 new unit tests in git-finalize.test.ts: squash-merged fallback, no prNumber, PR not merged, gh failure |
| SC1 | success_criterion | **SC1**: `extractProviderHintsStandalone`-class scenario (squash-merged PR, direct route) completes release gate without manual branch recreation | pass | Integration test in gate.release-enforcement.test.ts mocks squash-merged PR scenario, verifies gate completion |
| SC2 | success_criterion | **SC2**: Full test suite passes (`pnpm test`) | pass | Full test suite: 3604 tests pass (269 files) |
| SC3 | success_criterion | **SC3**: `pnpm run check` passes (typecheck + lint + format) | pass | pnpm run check: schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check all green |
| C1 | constraint | Reuse existing `readPrMergeState` function — do not duplicate PR state reading logic | respected | Reuses readPrMergeState at line 967, no duplication |
| C2 | constraint | Reuse existing `ReleaseReachabilityProof` type — `"pr_merged"` proof already exists | respected | Uses existing pr_merged proof from ReleaseReachabilityProof at line 81 |
| C3 | constraint | No changes to `classifyFinalizationRoute` or `detectArchiveMode` | respected | No changes to classifyFinalizationRoute or detectArchiveMode |
| C4 | constraint | No changes to `getReleaseFinalizationBlocker` in gate.ts — fix is in the reachability resolver | respected | No changes to getReleaseFinalizationBlocker in gate.ts |
| DONT1 | avoidance | Do NOT add a new proof type — `"pr_merged"` already covers this case | respected | No new proof type added, pr_merged already existed |
| DONT2 | avoidance | Do NOT change the `ReleaseReachabilityInput` interface — `prNumber` and `route` already available | respected | No changes to ReleaseReachabilityInput interface |
| DONT3 | avoidance | Do NOT add `gh` calls to the happy path — fallback only triggers when ancestry fails | respected | gh call only in fallback path after ancestry fails (line 1727) |
| DONT4 | avoidance | Do NOT modify Phase 9 git finalization logic | respected | No Phase 9 git finalization modifications |

