## Outcome

Archive Phase 9 git-finalize now caches idempotent git queries (remote URL, default branch, route classification, committer identity, origin HEAD, branch HEAD) within a single `finalizeRelease` invocation via `FinalizeInvocationState` accumulator. Reduces subprocess calls from 15-25+ to ≤12 and network fetches from 2-3 to ≤1 per invocation — ≥30% wall-clock improvement measured by warn-only bench.

## Why It Matters

Every ADV archive runs `finalizeRelease`, which previously re-queried the same git state 2-5× per invocation. With 85+ archived changes, this accumulated into noticeable latency during cleanup passes and multi-archive sessions.

## Verification

- 122/122 tests pass (109 original + 13 new AC7 cache-behavior tests covering hit, miss, invalidation per mutation kind, failure-rollback)
- Warn-only bench reports SC1/SC2/SC3 metrics (skip by default, `BENCH=1` opt-in)
- Public API unchanged: `finalizeRelease`, `GitFinalizeContext`, `classifyFinalizationRoute` signatures preserved
- Production entry point (`change.ts:3322`) requires no source change

## Risks / Follow-ups

- Cache invalidation correctness is a release-critical invariant (C4); thoroughly tested but any future mutation added to `finalizeRelease` must call the appropriate `invalidate*` helper
- No integration test for the bench itself (warn-only by design)