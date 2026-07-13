# Archive: Fix shallow repo identity

**Change ID:** fixShallowRepoIdentity
**Archived:** 2026-07-13T01:02:06.571Z
**Created:** 2026-07-11T15:08:33.961Z

## Tasks Completed

- ✅ Add typed identity resolution with shallow/graft refusal
  > Task checkpoint completed
- ✅ Build adv_store_consolidate scan/dry_run with collision refusal and ledger schema
  > Task checkpoint completed
- ✅ Implement consolidation execute: terminal-first import, live recreation, idempotent re-run
  > Task checkpoint completed
- ✅ Add identity-stability and consolidation spec deltas plus shallow-clone docs
  > Task checkpoint completed
- ⏭️ Run PokeEdge store consolidation via approved ops runbook
- ⏭️ Verify full contract: guard classes, consolidation matrix, PokeEdge counts
- ✅ Verify parent contract and post-merge handoff
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Branch-deploy hazard: the opt-in adv post-commit/pre-push hook runs `deploy-local.sh --fix` from the worktree, which builds and deploys the CHANGE BRANCH plugin to ~/.local/share/Advance and bounces Temporal workers. Under a trunk-only deployment policy this is a policy violation triggered by any commit inside the change worktree. Mitigation: after finishing branch commits, redeploy from the trunk checkout to restore runtime, and never rely on a branch-built tool for production ops (route live ops to a post-merge child change).
- **[pattern]** Pre-existing trunk-red triage: when a change's full-suite gate is red, classify each failure as (a) change-owned, (b) staleness (branch behind trunk; trunk reformatted/changed the file — fix by rebase, never by editing stale copies which reverts trunk logic), or (c) genuinely pre-existing trunk-red (test + asset identical base→trunk → trunk itself fails). Prove (b) via `git diff --shortstat base trunk -- file`; prove (c) via `git show trunk:file | rg pattern`. Confirm rebase is conflict-free first: `grep -Fxf <(branch files) <(trunk files)`.
