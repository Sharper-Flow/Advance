# Archive: Fix archive PR titles

**Change ID:** fixArchivePrTitles
**Archived:** 2026-07-25T19:13:21.341Z
**Created:** 2026-07-25T15:24:08.384Z

## Tasks Completed

- ✅ Stage modify-operation spec delta against `advance-workflow` / `rq-approvedPrAutoMerge01` adding the title-policy exception (design D6).
  > Task checkpoint completed
- ✅ Add typed `archive.pr_title_policy` field to ProjectConfigSchema (plugin/src/types/project.ts).
  > Task checkpoint completed
- ✅ Thread change.title + prTitleType + resolved prTitlePolicy into the finalize path and construct the correct PR title in createArchivePullRequest.
  > Task checkpoint completed
- ✅ Add optional `prTitleType` parameter to adv_change_archive (the archive handler), flowing into GitFinalizeContext.prTitleType.
  > Task checkpoint completed
- ✅ Make armPullRequestAutoMerge (git-finalize.ts:1583) policy-aware: the pre-merge title-policy guard. This is the SHARED chokepoint (called at 1704 by executePullRequestHandoff AND 2329 by redriveArchivedUnmergedBranch — both map !armed.ok → blocked). It is the ONLY merge-arming primitive; no bypass exists.
  > Task checkpoint completed
- ✅ Integration tests reproducing the full archive → PR → merge-arm path. This task verifies AC1-AC5 end-to-end and is the AC4 deliverable (PokeEdge PR #1020 repro).
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 1 delta(s)
