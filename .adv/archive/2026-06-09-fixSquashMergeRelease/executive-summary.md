# Executive Summary: Fix Squash-Merge Release Finalization

## Problem
When a PR is squash-merged, the release gate's `RELEASE_REQUIRES_TRUNK_MERGE` check fails because `resolveReleaseReachability` only checks git ancestry (`git log origin/trunk..change/{id}`). Squash merges create a new commit SHA on trunk, so the original change branch commits are not ancestors of trunk. Combined with `gh pr merge --delete-branch` deleting the remote branch, this made the release gate permanently blocked for squash-merged changes.

## Solution
Added a PR merge state fallback in `resolveReleaseReachability`'s direct route branch. When ancestry check fails and both `prNumber` and `route.repo` are available, the function now queries `gh pr view` via the existing `readPrMergeState` helper. If the PR shows `state: "MERGED"` with a `mergedAt` timestamp, it returns `{ reachable: true, proof: "pr_merged" }` — satisfying the release gate without manual branch recreation.

## What Was Built
- **Squash-merge fallback** in `git-finalize.ts:1725-1745`: 20-line addition in the direct route branch of `resolveReleaseReachability`
- **4 unit tests** in `git-finalize.test.ts`: squash-merged PR fallback, no prNumber guard, PR not merged guard, gh failure guard
- **1 integration test** in `gate.release-enforcement.test.ts`: verifies release gate completes with squash-merged PR scenario
- **Bonus fix**: `scripts/provider-eval.ts` missing `resolve` import from `node:path`

## What Was Verified
- **3604 tests pass** (269 test files, 0 failures)
- **`pnpm run check` green**: schemas:check, typecheck, test-isolation, lockfile-policy, lint, format:check
- **TDD discipline**: RED phase (4 failing tests) → GREEN phase (implementation) → integration test → full suite verification
- **Contract compliance**: All 18 contract items (7 ACs, 3 SCs, 4 constraints, 4 avoidances) verified and passing

## Impact
- Eliminates the need for manual branch recreation + poisoned-history recovery workarounds after squash merges
- Zero behavior change for non-squash paths (merge commits, rebase merges)
- Fallback only triggers when ancestry fails — no `gh` calls on the happy path
- Reuses existing `readPrMergeState` function and `"pr_merged"` proof type — no new abstractions