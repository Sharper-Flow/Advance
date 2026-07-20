# Contract Traceability

**Change ID:** fixArchivedBranchCleanup
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T19:54:03.698Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Existing detect tests unchanged (6 pass) + archived-branches tests reconciled to new per-branch call shape (detectArchivedMergedBranches still called with archivedChangeIds:string[]). Full suite 6564 pass. adv_run_test tr_mrtn5wq6. |
| SC2 | success_criterion | pass | review | New tests cover AC1 (list-not-called + concurrency cap<=4), AC2 (dryRun skip fetch), AC3 (fetch timeout degrade), AC4 (clamp+self-partial+emergency), AC5 (schema_error/not_found/data:null/not_archived), AC6 (changeId paths). 141 targeted pass (tr_mrtn5wq6). |
| SC3 | success_criterion | pass | review | pnpm run check GREEN (schemas/typecheck/manifests/isolation/lockfile/lint/format). Targeted 141 pass (tr_mrtn5wq6). Full suite 6564 pass + 1 expected fail, zero regressions. Build succeeds. |
| SC4 | success_criterion | pass | review | Disk-store perf harness on main repo (26 local change/* branches, 43 archived projections): NEW dryRun 953-1219ms across 3 runs vs 5s AC8 target. OLD list-enumeration alone 505ms + it additionally ran detect(~1.33s)+unbounded fetch. |
| C1 | constraint | respected | static_check | Tool args unchanged (timeoutMs pre-existing). Output additions (partial, omissions, effectiveTimeoutMs, timeoutNote) are additive only; all prior fields preserved. |
| C2 | constraint | respected | static_check | detectArchivedMergedBranches signature unchanged (input + deps:Pick<GitFinalizeDeps,'runGit'>). Inversion lives in the helper. 6 pre-existing detect tests pass unmodified. |
| C3 | constraint | respected | static_check | Helper contains no store.changes.list or listSummary calls (reviewer static-verified archived-branch-cleanup.ts). AC1 test asserts store.changes.list NOT called. |
| C4 | constraint | respected | static_check | detectSquashMergeByTree and git cherry proof-kind logic (git-finalize.ts) untouched; only the local-branch-list git call was extracted. mergeProof kinds unchanged (AC7). |
| C5 | constraint | respected | static_check | WORKTREE_CHECKED_OUT skip and deleteChangeBranch semantics unchanged; only a bounded runGit was injected into getCheckedOutChangeBranches. Deletion-path tests pass. |
| C6 | constraint | respected | static_check | mode='worktrees' branch untouched. adv-worktree.test.ts + status-hygiene.test.ts 33 pass; full suite green. |
| C7 | constraint | respected | static_check | execGit gains optional timeoutMs=5000 forwarded to execFile timeout (real SIGTERM). Backward-compatible; all existing callers keep default. git.test.ts rq-execGitTimeoutParam01 proves short budget kills slow git. Sub-budgets via execFile/spawnSync kill-on-timeout, not Promise.race. |
| C8 | constraint | respected | static_check | All implementation performed in change/fixArchivedBranchCleanup worktree; trunk untouched. |
| DONT1 | avoidance | respected | review | Archived status is determined solely by store.changes.get(id).status==='archived'. No merged-implies-archived heuristic. Fail-closed for every other outcome. |
| DONT2 | avoidance | respected | review | All LoadResult failure variants (not_found/schema_error/read_error/data:null/reject/timeout) surface as typed omissions with detail; none silently swallowed. AC5 tests confirm. |
| DONT3 | avoidance | respected | review | No changes to archive enumeration (#239) surface; only the cleanup helper's per-id inversion. store.changes.list left intact for its other callers. |
| DONT4 | avoidance | respected | review | detectArchivedMergedBranches internal squash/cherry loop unchanged; only the local-list git call extracted to listLocalChangeBranchEntries. |
| DONT5 | avoidance | respected | review | No cross-call archived-status cache added. Per-id gets run once per tool invocation; store layer owns any caching. |
| DONT6 | avoidance | respected | review | No new dependencies added; reused existing withTimeout, execGit, git-finalize helpers. pnpm lockfile unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8173c72f80b6 |  |  | C7, DONT6, C8 |  |
| tk-b7f1e362d422 |  |  | C2, C4, DONT4, C8 |  |
| tk-7203887b6042 |  | SC1, SC2 | C1, C3, C5, C6, DONT1, DONT2, DONT5, C8 |  |
| tk-6b1160298b68 |  | SC3, SC4 | C8 |  |
