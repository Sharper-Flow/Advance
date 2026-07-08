# Archive: Fix phase9 PR detection

**Change ID:** fixPhase9PrDetection
**Archived:** 2026-07-08T00:03:14.087Z
**Created:** 2026-07-07T15:22:48.981Z

## Tasks Completed

- ✅ RED tests for Phase-9 PR metadata loss and branch auto-delete
  > Added six failing regression tests for issue #202 across git-finalize, archive-gate, and gate release enforcement. Added minimal test scaffolding to allow dependency injection into verifyReleaseEvidenceFromMain and changeTipSha preservation input. RED evidence proves missing PR discovery in PR route, archived retry blocked instead of shipped, release gate branch-push blocker after auto-delete, and status evidence loss.
- ✅ Add durable Phase-9 evidence schema and preservation helper
  > Added optional repo field to Phase9FinalizationStatusSchema and regenerated schema. Added preservePhase9Evidence helper and wired status transitions so existing repo/prNumber/prUrl/route/changeTipSha/autoMergeArmed evidence is retained across pending_merge and done status recordings in archive retry and async/sync archive paths.
- ✅ Repair PR-route reachability cascade
  > Updated PR-route release reachability to discover merged PRs when prNumber is absent, return pr_merged proof with PR number/merge commit, and classify missing PR metadata/proof distinctly from actual pr_unmerged. Wired verifyReleaseEvidenceFromMain through the new cascade so archived-bundle PR retry can return shipped when merged PR is discoverable. Direct-route behavior and fail-closed safety preserved.
- ✅ Wire Phase-9 dispatch, retry, and release-gate blocker to durable PR evidence
  > Recorded route/repo metadata at async Phase-9 dispatch, threaded phase9_status.repo into verifyReleaseEvidenceFromMain, and changed release-gate PR-mode blocker to call resolveReleaseReachability before branch-push checks. Branch auto-delete no longer blocks release when merged PR proof exists; missing proof still fails closed with details.
- ✅ Verification sweep and release-readiness evidence
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For PR-mode archive release proof, branch existence is not authoritative after squash-merge/auto-delete. Check structural PR/default-branch reachability first; branch push status is only diagnostic when no merge proof exists.
