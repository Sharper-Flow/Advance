# Executive Summary

## Outcome

Archive Phase 9 now structurally detects merge-queue repositories, reconciles stale change branches before PR handoff, and fails closed when GitHub policy cannot be determined. Release proof remains centralized in `resolveReleaseReachability` and is queue-agnostic — queue merges, auto-merges, and manual merges all resolve to PR state `MERGED`.

## What Was Built

1. **Merge-queue-aware route classification** — `classifyFinalizationRoute` scans branch rules for `type === "merge_queue"` from the existing `repos/{repo}/rules/branches/{default}` API call. Returns a first-class `merge_queue` route that skips local reconciliation (queue provides freshness via `merge_group`).

2. **Safe freshness reconciliation** — `reconcileChangeBranchWithDefault` runs `git merge --no-edit origin/{default}` in the change worktree before PR handoff for non-queue routes. Blocks on merge conflicts with diagnostic file paths. Blocks on `required_linear_history` branch rule to avoid creating a merge commit that would violate the rule.

3. **Fail-closed policy detection** — Policy detection failures (`gh` unavailable, unauthenticated, rules unreadable/unparseable, auto-merge status unavailable) now route to `blocked` with `POLICY_DETECTION_FAILED` instead of `pr_manual`. Known-policy cases (`AUTO_MERGE_DISABLED`) remain `pr_manual`.

4. **Shared PR handoff sequence** — `executePullRequestHandoff` extracted from `completeProtectedBranchViaPullRequest` to eliminate duplication between queue and non-queue paths. `completeMergeQueueHandoff` uses the shared sequence without reconciliation.

5. **Delete-branch guardrail** — Regression test codifies that `armPullRequestAutoMerge` never passes `-d`/`--delete-branch`, which cli/cli rejects on queue PRs.

6. **Specs and docs** — `rq-releaseFinalization01.12–.16` added to `docs/specs/advance-workflow.md`. `adv-archive.md` Step 4.5 updated with merge_queue route. `ADV_INSTRUCTIONS.md` documents local-user-token auth assumption.

## What Was Verified

- **Tests:** 270 files, ~3700 tests pass. Full check suite green (schemas:check, typecheck, lint, format:check, build).
- **Review:** Independent acceptance reviewer verdict: READY, 0 blocking findings, 0 nonblocking findings.
- **Contract:** 20/20 items pass review matrix (4 SC, 6 AC, 6 C, 4 DONT).

## Key Decisions

- **Merge queue detection reuses existing API** — zero new network calls. Rule `type` scan is a pure function over already-fetched response.
- **Queue provides freshness** — no local rebase/reconcile for queue repos; `merge_group` validates against latest base.
- **`git merge` (not rebase)** for non-queue reconciliation — preserves history, is non-destructive, blocks on linear-history rule.
- **No GraphQL** — `gh pr merge --auto` is the documented queue-correct handoff; strategy is ignored for queue repos.