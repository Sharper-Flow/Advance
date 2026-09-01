## Cross-Project Origin

This change was created as a follow-up from **pokeedge**.

| Field | Value |
|-------|-------|
| Source project | pokeedge |
| Source path | `/home/jon/dev/pokeedge` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Fix archive finalization friction

## Why

Archiving `preserveGalleryImageSelection` (pokeedge-web, PRs #786 + #789, 2026-09-01) hit three plugin defects that required manual workarounds. Every future archive that lands a refreshed bundle PR, retries finalization, or races base-branch movement will hit the same three.

## Root Cause Analysis

### RCA-1 — multi-PR merge proof refuses a state the plugin itself creates

`plugin/src/tools/worktree/index.ts` `getPrMergedBranchIntegration` lists merged PRs for a branch, filters structurally valid candidates (same repo, head=branch, base=default, non-cross-repo, merge commit present), and refuses when `structuralCandidates.length > 1` (reason `pr_evidence_invalid`, hint "Multiple merged PRs matched"). The archive flow itself creates this state: the product squash (PR A) merges, finalization then refreshes the archive bundle on the branch, and the follow-up bundle PR (PR B) merges. Both are structurally valid merged PRs for the same head branch. The refusal is pure ambiguity-guard: the loop immediately below the guard already iterates every candidate and validates a full proof chain per candidate (fetch refs/pull/N/head, verify head sha, ancestor check, merge-commit reachability from default). Two candidates cannot weaken a proof that any one of them fully validates. Removal of the guard lets the existing loop prove integration; the fall-through refusal (`local_has_commits_after_pr_head`) still protects the unmerged case.

### RCA-2 — retry re-validates a fresh caller argument against an already-merged PR

`plugin/src/tools/archive-helpers/git-finalize.ts`: `redriveArchivedUnmergedBranch` (and `executePullRequestHandoff`) reuse the existing PR via `ensureArchivePullRequest`, then unconditionally call `armPullRequestAutoMerge` with the caller's fresh `prTitleType` before ever checking PR state. `armPullRequestAutoMerge` validates the live PR title against that fresh argument (must start with `<prTitleType>:`) and blocks with `PR_TITLE_POLICY_VIOLATION` / `AUTO_MERGE_ARM_FAILED`. In the incident, the recorded PR was already MERGED; arming a merged PR is meaningless, and `resolveReleaseReachability` — which would have returned `pr_merged` → shipped — never ran. The title was policy-valid when the PR was created on the first call; a retry supplying a different type argument cannot make the merged PR invalid.

### RCA-3 — pending_merge outcome carries no stall reason

After a successful arm, the finalize path returns `pending_merge`. When the PR is BEHIND and the branch is non-rebaseable (`maintainerCanModify: false` makes GitHub unable to auto-update it), auto-merge never fires and the outcome gives the operator no signal: no mergeStateStatus, no remediation. The incident required an external watcher to notice, then a manual `oc-fresh sync` + force-push to unblock.

## Scope

### In Scope

- Remove the `structuralCandidates.length > 1` refusal; let the per-candidate proof loop decide. Keep all per-candidate validations unchanged.
- Guard the two arm call sites: when the reused PR state is MERGED, skip arming and proceed directly to reachability.
- On reuse of an OPEN PR whose live title already carries a conventional type in `allowed_types`, arm without requiring the prefix to equal the fresh `prTitleType` argument; still block non-conventional or disallowed titles. Keep the strict prefix requirement for PRs the plugin creates this call.
- After arming, read PR `mergeStateStatus` once and, when the branch cannot progress on its own (BEHIND, DIRTY, or BLOCKED with auto-merge enabled and not in a merge queue), attach that status and an actionable remediation (update branch + rerun finalization) to the pending_merge outcome. Detection and surfacing only — no automatic branch mutation.

### Out of Scope

- Automatic branch updates, force-pushes, or merge-queue manipulation by the plugin.
- Changing how the archive flow creates or labels the follow-up bundle PR.
- adv_worktree_cleanup scanner behavior beyond what the shared proof helper fixes.

### Must Not

- Must not weaken any per-candidate proof check in the delete planner.
- Must not arm auto-merge on a closed PR, or bypass the release_types guard for non-releasing titles.
- Must not remove the pending_merge polling contract; only enrich its payload.

## Evidence

- Incident record: pokeedge-web PRs #786 (merged 21:12:39Z) and #789 (merged 21:31:45Z); adv_worktree_delete refusals `PLAN_REQUIRED` → `INTEGRATION_REQUIRED` (pr_evidence_invalid: multiple merged PRs matched), including with force; adv_worktree_cleanup mode=archived_branches found 0 candidates (same proof model).
- Retry block: `AUTO_MERGE_ARM_FAILED` with `PR_TITLE_POLICY_VIOLATION` — live title 'feat: Preserve gallery image selection' vs supplied 'chore:'.
- Stall: PR #786 armed at 20:26:14Z, mergeStateStatus BEHIND, rebaseable false, merged only after manual rebase + force-push at ~21:0xZ.