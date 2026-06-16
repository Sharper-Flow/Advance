# Contract Traceability

**Change ID:** fixSquashMergeRelease2
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-16T02:07:44.738Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | resolveReleaseReachability unchanged — accepts only origin/default reachability, PR MERGED, or squash tree match. Tests verify pending_merge returned for unmerged PR. No code path records shipped without proof. |
| SC2 | success_criterion | pass | review | reconcileChangeBranchWithDefault called in completeProtectedBranchViaPullRequest before pushChangeBranch. Blocks on RECONCILE_CONFLICT with conflictFiles and LINEAR_HISTORY_REQUIRED. Tests cover success, conflict, linear-history, up-to-date. |
| SC3 | success_criterion | pass | review | completeMergeQueueHandoff returns pending_merge when PR is OPEN with autoMergeArmed. resolveReleaseReachability only accepts MERGED state. Test asserts pending_merge for unmerged queue PR. |
| SC4 | success_criterion | pass | review | classifyFinalizationRoute returns { route: 'blocked', reason: 'POLICY_DETECTION_FAILED' } for gh unavailable, rules API failure, unparseable rules, auto-merge status unavailable. Tests verify all paths. |
| AC1 | acceptance_criterion | pass | test | Test: classifyFinalizationRoute with merge_queue rule type in rules response → route === 'merge_queue', mergeQueueRequired === true. 71 git-finalize tests pass. |
| AC2 | acceptance_criterion | pass | test | Tests: reconcileChangeBranchWithDefault success (ok), conflict (blocked with conflictFiles), linear-history (blocked LINEAR_HISTORY_REQUIRED), up-to-date (ok). Uses git merge --no-edit, non-force. git-finalize.test.ts. |
| AC3 | acceptance_criterion | pass | test | Test: completeMergeQueueHandoff pending (PR OPEN, autoMergeArmed → pending_merge), shipped (PR MERGED → shipped), blocked (arming failed → blocked). Uses gh pr merge --auto without -d. |
| AC4 | acceptance_criterion | pass | test | Tests: gh unavailable → blocked/POLICY_DETECTION_FAILED, rules API non-zero → blocked, AUTO_MERGE_STATUS_UNAVAILABLE → blocked. Blocked route prevents PR handoff, release recording, cleanup. |
| AC5 | acceptance_criterion | pass | test | resolveReleaseReachability unchanged. Existing detectSquashMergeByTree test (line 2065+) still passes. Squash PR merge state accepted as proof. 71 tests pass. |
| AC6 | acceptance_criterion | pass | test | Full suite: 270 files, ~3700 tests pass. Coverage: direct route, pr_auto_merge, merge_queue, stale branch (success/conflict/linear-history), squash proof, blocked policy. Specs rq-releaseFinalization01.12-.16 added. |
| C1 | constraint | respected | static_check | rq-releaseFinalization01.1-.11 unchanged. Scenarios .12-.16 extend with new cases (freshness, queue, fail-closed, detection, deletion guard). No existing requirement weakened. |
| C2 | constraint | respected | static_check | reconcileChangeBranchWithDefault operates on workdir parameter, never main checkout. resetMainToOriginDefault uses git reset --hard origin/{default} which keeps main on default branch. No git checkout/switch calls. |
| C3 | constraint | respected | static_check | pending_merge and blocked outcomes return GitFinalizeOutcome with status !== 'shipped'. Change remains active. phase9_status tracks pending/blocked state. |
| C4 | constraint | respected | static_check | classifyFinalizationRoute inspects rule type field (structural), not rule name/count heuristics. merge_queue detected by type === 'merge_queue' on parsed rules array. |
| C5 | constraint | respected | static_check | No git push --force or git push -f calls in reconcileChangeBranchWithDefault or completeMergeQueueHandoff. git merge --no-edit is non-destructive. pushChangeBranch uses normal push. |
| C6 | constraint | respected | static_check | armPullRequestAutoMerge runs gh pr merge <number> --squash --auto — no -d/--delete-branch flag. Regression test asserts args never include delete flags. Comment documents cli/cli rejection invariant. |
| DONT1 | avoidance | respected | review | resolveReleaseReachability only returns reachable=true for PR MERGED, origin/default reachability, or squash tree match. Auto-merge armed (autoMergeArmed=true) with PR OPEN returns reachable=false, proof='pr_unmerged'. |
| DONT2 | avoidance | respected | review | No GraphQL enqueuePullRequest mutation. No git rebase calls. Uses gh pr merge --auto (documented queue-correct CLI) and git merge --no-edit (non-destructive). |
| DONT3 | avoidance | respected | review | No git checkout or git switch commands in reconcileChangeBranchWithDefault, completeMergeQueueHandoff, or executePullRequestHandoff. Main checkout invariant preserved. |
| DONT4 | avoidance | respected | review | resolveReleaseReachability unchanged — still the single proof authority. No code bypasses it. All handoff paths call it before mapping to outcome. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-dd75d3c483e5 | AC1, AC4 | AC1, AC4, SC1, SC4 | C1, C4, DONT4 |  |
| tk-83b3daca1fe1 | AC2 | AC2, SC2 | C2, C5, DONT3 |  |
| tk-a3d9f4be9309 | AC3 | AC3, SC3 | C3, C6, DONT1, DONT2 |  |
| tk-111d8c6560ed | AC6 |  | C1, C6, DONT1 |  |
| tk-4aee1185c983 | AC5 | AC5, AC6, SC1, SC2, SC3, SC4 | C1, DONT4 |  |
