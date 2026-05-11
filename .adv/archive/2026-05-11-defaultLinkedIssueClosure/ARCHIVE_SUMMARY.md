# Archive: Default linked issue closure on archive

**Change ID:** defaultLinkedIssueClosure
**Archived:** 2026-05-11T03:28:12.954Z
**Created:** 2026-05-11T02:59:07.514Z

## Tasks Completed

- ✅ Update archive close-issue command/spec contract.
  > Updated archive issue-close command/spec contract and verified no active default-off opt-in wording remains outside historical archive bundles. Checkpoint clean because changes were included in prior GREEN commit beef304.
- ✅ Update or add asset tests for issue-close default contract.
  > Added asset coverage in plugin/src/adv-autonomy-quality-assets.test.ts and updated ADV_INSTRUCTIONS.md, .opencode/command/adv-archive.md, and .opencode/command/adv-triage.md to satisfy the default linked issue closure contract.
- ✅ Final verification for default linked issue closure.
  > Verified default linked issue closure contract change via active-text search, targeted asset tests, and repo-defined check command. Worktree clean at beef304.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When updating archive issue-close contract, ignore historical `.adv/archive/**` references during active-text searches; they preserve old archived behavior and should not be rewritten for new command semantics.
