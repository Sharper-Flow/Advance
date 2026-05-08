# Archive: Fix git mutation guard deadlock: allow recovery commands on dirty default branch

**Change ID:** fixGitMutationGuardDeadlock
**Archived:** 2026-05-08T23:02:25.053Z
**Created:** 2026-05-08T22:56:15.577Z

## Tasks Completed

- ✅ Add stripHeredocs function to git-guard: regex-based heredoc content stripping applied in checkBashCommand before classification. Prevents false mutation detection on git commands inside heredoc bodies.
  > Task completed
- ✅ Add RECOVERY category to git-guard: new GitCommandCategory value, RECOVERY_SUBCOMMANDS set (stash, checkout, switch), classifySubcommand handling, evaluateDecision fast-path allowing recovery commands on dirty default branch. Update classifyCommand severity order.
  > Task completed
- ✅ Add tests for RECOVERY category: stash/checkout/switch on dirty default → ALLOW, commit/add/push still BLOCK on dirty default, classifySubcommand returns RECOVERY, stripHeredocs removes heredoc content.
  > Task completed

## Specs Modified

