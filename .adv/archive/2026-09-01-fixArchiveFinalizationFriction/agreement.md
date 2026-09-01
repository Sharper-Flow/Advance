# Agreement

## Objectives

1. Make worktree deletion prove integration for branches whose content landed through multiple squash-merged PRs from one head branch.
2. Make finalization retries idempotent: a recorded PR that is already merged completes as shipped without re-arming or re-validating its title against a fresh argument.
3. Surface why an armed PR is not progressing instead of returning a bare pending_merge.

## Success Criteria

- **SC1.** A branch with two merged structural PR candidates deletes cleanly when any one candidate's proof chain validates, and still refuses when no candidate validates.
- **SC2.** Re-driving finalization whose recorded PR is MERGED returns shipped and never invokes `gh pr merge`.
- **SC3.** Reusing an OPEN PR whose live title is conventional with an allowed type arms successfully regardless of the retry's `prTitleType` argument; non-conventional or disallowed titles still block.
- **SC4.** A pending_merge outcome whose PR is BEHIND/DIRTY/BLOCKED-with-auto-merge carries `mergeStateStatus` and a remediation naming the branch update step.

## Acceptance Criteria

- **AC1.** Given two structurally valid MERGED PRs for `change/<id>` where the local head equals the newer PR's head and its merge commit is reachable from default, when worktree deletion runs, then integration is proven with proof `pr-head-exact` and deletion proceeds to plan issuance.
- **AC2.** Given two merged candidates where neither head contains the local branch tip, when deletion runs, then it refuses with `local_has_commits_after_pr_head`.
- **AC3.** Given a reused PR with `state === "MERGED"` and its merge commit reachable, when either handoff path runs, then the outcome is `shipped` via `pr_merged` proof and `armPullRequestAutoMerge` is not called.
- **AC4.** Given a reused OPEN PR titled `feat: X` and a retry argument `prTitleType: "chore"` under a conventional policy allowing both, when arming runs, then it arms; given a reused OPEN PR titled `Update stuff` (no conventional prefix), then it blocks with `PR_TITLE_POLICY_VIOLATION`.
- **AC5.** Given an armed OPEN PR with `mergeStateStatus: BEHIND`, when the finalize path returns pending_merge, then the blocked/pending payload includes `BEHIND` and a remediation containing the words "update the branch".

## Constraints

- **C1.** Per-candidate proof checks (head sha verify, ancestor check, merge-commit reachability, repo/base/head structural match) are unchanged.
- **C2.** `armPullRequestAutoMerge` never passes `-d`/`--delete-branch`; unchanged.
- **C3.** The stall signal is read-only: one `gh pr view` after arming; no branch mutation, no force-push, no merge-queue manipulation.
- **C4.** Strict prefix requirement for PRs created by the current call remains.

## Avoidances

- **DONT1.** Do not pick a single candidate deterministically (by number, date, or head sha) and discard the others — evaluate all.
- **DONT2.** Do not skip the release_types guard or arm closed PRs.
- **DONT3.** Do not mutate the PR or branch to resolve a stall automatically.
- **DONT4.** Do not change the cleanup scanner's tree-identical model or the pending_merge polling contract beyond payload enrichment.

## Coordination

- Incident evidence: pokeedge-web PRs #786/#789, archive of `preserveGalleryImageSelection`, 2026-09-01.
- Deploy of the fixed plugin follows the repo's normal plugin release path; no coordinated downstream rollout needed.