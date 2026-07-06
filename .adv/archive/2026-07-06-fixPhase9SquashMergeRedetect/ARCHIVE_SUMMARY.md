# Archive: Fix phase9 squash-merge redetect

**Change ID:** fixPhase9SquashMergeRedetect
**Archived:** 2026-07-06T00:41:30.541Z
**Created:** 2026-07-05T23:32:49.773Z

## Tasks Completed

- ✅ Add optional `changeTipSha: z.string().optional()` field to `Phase9FinalizationStatusSchema` in `plugin/src/types/changes.ts:782`.
  > Task checkpoint completed
- ✅ RED test: reproduce the branch-deleted squash-merge scenario at the `resolveReleaseReachability` level.
  > Task checkpoint completed
- ✅ GREEN implementation: thread `changeTipSha` through reachability and modify `detectSquashMergeByTree` to use the tip when provided.
  > Task checkpoint completed
- ✅ Capture the change-tip SHA at the first pending `recordPhase9Status` call in the archive dispatch path.
  > Task checkpoint completed
- ✅ End-to-end regression test: phase-9 retry path with persisted tip completes the release gate after branch deletion.
  > Task checkpoint completed
- ✅ AC4: enrich the blocked-result remediation with an `adv_change_status_repair` pointer when reachability cannot be established.
  > Task checkpoint completed
- ✅ Final verification: run the full pre-push gate to confirm no regressions across the entire suite.
  > Task checkpoint completed
- ⏭️ P2 deferrable slice: patch-id fallback with `--stable` flag.

## Specs Modified

