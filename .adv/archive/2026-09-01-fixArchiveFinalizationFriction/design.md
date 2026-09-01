# Design

## Architecture

Three fixes at their traced sites, plus the spec-law delta that legalizes the second. No schema migrations, no new tools.

### D1 — evaluate all merged-PR candidates (worktree/index.ts)

Delete the `structuralCandidates.length > 1` refusal (index.ts:1505-1513) in `getPrMergedBranchIntegration`. The per-candidate loop that follows (1515-1646) is self-contained per iteration — fetch `refs/pull/N/head`, verify `FETCH_HEAD == pr.headRefOid`, `merge-base --is-ancestor`, merge-commit reachability — with soft failures `continue`ing and no shared mutable state. First fully-validating candidate wins; no validating candidate falls through to the existing `local_has_commits_after_pr_head` refusal. Candidates stay in GitHub's return order; no preselection (DONT1). One terminal exception stays exactly as is: an unreachable merge commit (1621-1627) returns a refusal rather than continuing, because a merged PR whose merge commit is off the default branch is a defect worth refusing on, and planner mapping (`pr_merge_commit_unreachable`) depends on it. No test currently asserts the multi-PR refusal — the `pr_evidence_invalid` tests at index-delete.test.ts:1393-1424 are single-candidate structural failures and stay green; D1 adds the multi-candidate positive and negative cases.

### D2 — arm against the live title; skip arming when merged (git-finalize.ts + spec delta)

1. **MERGED skip.** In `executePullRequestHandoff` (covers `completeMergeQueueHandoff` and `completeProtectedBranchViaPullRequest`, which delegate to it) and `redriveArchivedUnmergedBranch`, when `ensureArchivePullRequest` returns `state === "MERGED"` (strict equality; `UNKNOWN` does not skip), skip `armPullRequestAutoMerge` and go straight to `resolveReleaseReachability`, which independently proves `pr_merged` from `gh pr view` state (`readPrMergeState`, 1301-1304, 3104-3131) and maps to `shipped`. Safety on the skip: `readPullRequestByBranch`'s field list (1792) gains `headRefOid`, and when the caller supplied `changeTipSha`/`preArchiveTipSha`, the PR head must match one of them — otherwise the skip refuses with a new `MERGED_PR_HEAD_MISMATCH` block, so local commits pushed after the merge cannot silently ship. Note `gh pr merge --squash --auto` on a merged PR is a no-op success on current gh; the skip removes the pointless title guard + API call, and the guard was the actual incident blocker.

2. **Validate the parsed title, not the caller's claim.** In `armPullRequestAutoMerge`, replace `liveTitle.startsWith("<prTitleType>:")` with parsing the live title's own conventional type: no conventional prefix → block `PR_TITLE_POLICY_VIOLATION`; parsed type outside `allowed_types` → block `PR_TITLE_POLICY_VIOLATION`; `release_types` guard applies to the parsed type (message wording keyed to parsed type). The armer's `prTitleType` and the already-dead `changeTitle` parameters are dropped — its only two call sites pass nothing the armer needs. `PR_TITLE_TYPE_UNRESOLVED` becomes creation-path-only, where `createArchivePullRequest` already enforces it (1841-1849); `prTitleType` threading through handlers-archive/finalizeRelease stays for creation.

3. **Spec delta.** Law `rq-approvedPrAutoMerge01` (docs/specs/advance-workflow.md:388,444; .adv/specs/advance-workflow/spec.json:428,490) enumerates `PR_TITLE_TYPE_UNRESOLVED` as an armer blocker. This change ships a modify-delta on that law covering both the parsed-type semantics and the armer no longer returning `PR_TITLE_TYPE_UNRESOLVED`, following the `dl-archivePrTitlePolicyException` precedent from `fixArchivePrTitles` (2026-07-25). Docs mirror regenerates in the same commit; spec artifact tests must pass with the delta.

### D3 — surface the stall inside the existing read (git-finalize.ts)

No separate probe. `readPrMergeState` already runs `gh pr view`; its field list (1303) gains `mergeStateStatus` and `isInMergeQueue`. When either handoff path is about to return `pending_merge` (inline literals at 2209-2222 and 2879-2889 — both get the field, or a small shared constructor), and the PR reports `mergeStateStatus` `BEHIND` or `DIRTY`, attach optional `stallWarning: { mergeStateStatus, remediation }` to `GitFinalizeOutcome`, where the remediation names the operator step: update the branch onto the base and re-run archive finalization. `isInMergeQueue` absent means unknown, never false (gh feature-detects the field). BLOCKED is deliberately not warned on — it is the healthy CI-waiting steady state and warning would be noise; only states that cannot self-resolve warn. Zero extra gh calls (C3); no mutation (DONT3). `stallWarning` is output-only — surfaced via the `finalization` passthrough in handlers-archive.ts:1435-1442 — and is NOT persisted into `phase9_status`; no zod schema or carry-forward change, keeping `buildPendingMergePhase9Status` untouched.

## Implementation Strategy

1. D1: remove the guard; add multi-candidate tests (two candidates, newer validates → `pr-head-exact`; older unreachable-merge-commit stays terminal; none validate → refusal).
2. D2: MERGED skip + `headRefOid` field + tip-match guard in both handoffs; parsed-type armer with dropped params; spec modify-delta on `rq-approvedPrAutoMerge01` + mirror regen; update title-policy test block (5571 armer-UNRESOLVED test moves to creation-path suite; 5606/5618/5695/6578 string updates; new mismatch-arms and merged-skip cases asserting `runGh` never receives `pr merge`).
3. D3: field-list extension + `stallWarning` on both pending literals; tests: BEHIND attaches, MERGEABLE attaches nothing, absent isInMergeQueue tolerated.
4. Full verification: repo suite, typecheck, lint, spec artifact tests.

## Testing

Red/green per fix at the existing surfaces — `plugin/src/tools/worktree/index-delete.test.ts`, `plugin/src/tools/archive-helpers/git-finalize.test.ts` — using the existing gh/git mock harness. Spec delta validated by the repo's spec artifact tests.

## Risks

- Title-policy message strings asserted verbatim; wording changes land in the same commits as the test updates.
- Spec deltas are law changes; the delta must ship with the code or spec tests fail — enforced by putting both in one task.
- BLOCKED-wait noise avoided by design (only BEHIND/DIRTY warn).

## Release

Normal plugin path. Fixes only loosen false refusals, add an optional output field, and tighten one safety check (tip-match on MERGED skip).