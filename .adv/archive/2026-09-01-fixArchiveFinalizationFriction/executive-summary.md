# Fix archive finalization friction

## Outcome

The plugin now proves integration for branches landed through multiple squash
PRs, completes finalization retries against already-merged PRs without
re-validating titles against a fresh caller argument, and tells the operator
why an armed PR is not progressing.

## What changed

Three defects traced from the pokeedge-web archive of
`preserveGalleryImageSelection` (PRs #786 + #789, 2026-09-01):

1. `getPrMergedBranchIntegration` refused deletion whenever more than one
   structurally valid merged PR matched a branch — the archive flow's own
   shape after a product squash plus a bundle-refresh PR. The refusal is gone;
   the per-candidate proof loop that already followed it decides, and its
   per-candidate checks are unchanged.

2. Retries re-validated the caller's fresh `prTitleType` against the recorded
   PR's live title before arming, so a merged PR blocked finalization on an
   argument mismatch. Reused MERGED PRs now skip arming and ship straight
   through reachability — guarded by a new `MERGED_PR_HEAD_MISMATCH` check
   that the PR head matches a saved change tip, so post-merge local commits
   cannot silently ship. On reused OPEN PRs the armer parses the live title's
   own conventional type instead of trusting the caller's claim; bad titles
   still block. `PR_TITLE_TYPE_UNRESOLVED` is creation-path-only.

3. `pending_merge` outcomes were mute while an armed PR sat BEHIND and
   non-rebaseable. The reachability read now carries `mergeStateStatus` and
   `isInMergeQueue`; BEHIND and DIRTY attach an advisory `stallWarning` with
   the branch-update remediation. BLOCKED and queued stay silent. One gh call,
   zero mutations, output-only.

The behavior change to arming legality shipped as a modify-delta on
`rq-approvedPrAutoMerge01` in both the spec and its docs mirror.

## Evidence

- Red/green/verify per task: worktree suite 219/219, finalize/gate/phase9
  185/185, stall suite 166/166.
- Full plugin suite: 392 files green; two remaining failures
  (`adv_followup_promote` frozen-snapshot, prompt-budget +11255) reproduce
  identically on base trunk and are pre-existing.
- Independent acceptance reviewer: READY, no findings, six expected files.

## Open items

The two pre-existing trunk failures above need an owner; this change did not
touch the tool registry or prompt surfaces.
