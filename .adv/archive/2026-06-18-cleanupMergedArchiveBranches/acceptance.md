# Acceptance

Reviewed at: 2026-06-17T23:29:17.174Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1** — PR-mode ADV changes do not accumulate stale local `change/*` branches after their PR merges. | pass | adv_archive_repair cleanup_merged action provides operator-explicit cleanup; AC1-AC12 verified pass |
| SC2 | success_criterion | **SC2** — Cleanup is safe by construction: no unmerged branch is ever deleted. | pass | git branch -d invariant (never -D) + worktree safety belt-and-suspenders; AC4/AC6 verified pass |
| SC3 | success_criterion | **SC3** — ADV documentation accurately describes branch-cleanup behavior across all archive modes. | pass | AGENTS.md updated (commit 72d05f61); rq-archiveBranchCleanup01 spec added |
| SC4 | success_criterion | **SC4** — No new background processes, polling loops, or scheduled tasks introduced. | pass | Operator-explicit tool only; no daemons, no session-start hooks, no scheduling |
| AC1 | acceptance_criterion | **AC1** — A new tool (or `adv_archive_repair` action) scans local `change/*` branches tied to ADV changes with status `archived`, evaluates each against the local default branch via `git cherry` (patch-id equivalence, squash-merge safe), and deletes the safe ones using `git branch -d`. | pass | T3 handler tests: cleanup_merged scan lists candidates with merge proof (tree-identical / patch-equivalent) |
| AC2 | acceptance_criterion | **AC2** — Cleanup defaults to **wet-run**; accepts a `dryRun` flag for preview-only mode that lists candidates + merge proof without deleting. | pass | T3 test: cleanup_merged dryRun returns candidates without deleting |
| AC3 | acceptance_criterion | **AC3** — Cleanup scope is restricted to local `change/*` branches whose ADV change status is `archived`; branches tied to active/closed/draft/pending changes are skipped and surfaced with rationale. | pass | T3 test: cleanup_merged filters non-archived changes |
| AC4 | acceptance_criterion | **AC4** — Local deletion uses `git branch -d` only; never falls back to `-D`; git's refusal (unmerged) is captured and reported per-branch. | pass | T3 non-regression guard: deleteChangeBranch calls branch -d only; existing 5 tests cover refusal path |
| AC5 | acceptance_criterion | **AC5** — Remote `push --delete` is best-effort per deleted local branch; failure because GitHub auto-delete already removed the head is treated as success-with-warning, not error. | pass | T3 test: cleanup_merged tolerates remote-already-deleted as warning |
| AC6 | acceptance_criterion | **AC6** — Cleanup refuses to delete any branch currently checked out in any active worktree; surfaces refusal with the worktree path. | pass | T2 test: worktree list --porcelain exclusion; T3 test: cleanup_merged excludes branches checked out in worktrees |
| AC7 | acceptance_criterion | **AC7** — Direct-archive branch cleanup at `plugin/src/tools/change.ts:4436-4441` is unchanged in behavior (non-regression). | pass | T3 source-level non-regression guard: archiveMode === 'direct' gate at change.ts:4436-4441 unchanged |
| AC8 | acceptance_criterion | **AC8** — `adv_status view:"summary"` includes a recommendation line when ≥1 archived-change local branch is detected as safely deletable. | pass | T4 test: summary view includes recommendation line when archived merged branches detected |
| AC9 | acceptance_criterion | **AC9** — `adv_status view:"hygiene"` includes a section listing stale merged `change/*` branches with per-branch merge proof. | pass | T4 test: hygiene view includes archived_branch_hygiene field with per-branch detail |
| AC10 | acceptance_criterion | **AC10** — `/home/jon/dev/advance/AGENTS.md` claim about archive branch cleanup is accurate for both direct-mode and PR-mode archives. | pass | T5 grep verification: 1 reference to adv_archive_repair action=cleanup_merged in AGENTS.md |
| AC11 | acceptance_criterion | **AC11** — Tests cover: archived-only filter, squash-merged branch detection via `git cherry`, `git branch -d` refusal path, dry-run mode, remote-already-deleted tolerance, worktree-checked-out refusal, non-regression of direct-mode cleanup, status/hygiene surfacing. | pass | 153 tests pass across archive-repair (11), git-finalize (80), status (42), porcelain-parser (5), triage (13) |
| AC12 | acceptance_criterion | **AC12** — A new spec requirement `rq-archiveBranchCleanup01` (with Given/When/Then scenarios) is added under the `advance-workflow` capability covering post-merge branch cleanup for archived changes. | pass | T5 spec read-back: FOUND rq-archiveBranchCleanup01 5 scenarios; advance-workflow version 1.18.0 |
| C1 | constraint | **C1** — P37 (no-polling-loops): operator-explicit invocation only; no background sweeps, daemons, session-start hooks, or scheduled tasks. | respected | Code review: handler invoked only via explicit tool call; no scheduling, no daemons, no session hooks |
| C2 | constraint | **C2** — P32 (worktree-isolation): never delete a branch currently checked out in any active worktree. | respected | KD4: getCheckedOutChangeBranches via reused porcelain parser + git branch -d second guard |
| C3 | constraint | **C3** — Safety first: local deletion uses `git branch -d` semantics only; never falls back to `-D`. | respected | deleteChangeBranch reuses existing primitive; source review confirms branch -d only |
| C4 | constraint | **C4** — Non-regressive: direct-archive branch cleanup at `change.ts:4436-4441` continues to work unchanged. | respected | T3 source-level non-regression guard test |
| C5 | constraint | **C5** — Single-repo scope (`Sharper-Flow/Advance`); no cross-repo / product scope. | respected | All touched files in Sharper-Flow/Advance; no cross-repo code paths |
| DONT1 | avoidance | **DONT1** — No background polling, daemons, or session-start auto-cleanup hooks. | respected | No background code introduced |
| DONT2 | avoidance | **DONT2** — No pre-PR branch synchronization (covered by GitHub issue #169). | respected | No pre-PR sync logic; #169 is separate concern |
| DONT3 | avoidance | **DONT3** — No temp/session artifact cleanup (covered by in-flight `addArchiveCleanupScanner` change). | respected | No artifact cleanup; addArchiveCleanupScanner is separate in-flight change |
| DONT4 | avoidance | **DONT4** — No re-architecting of Phase 9 finalization mechanics. | respected | Phase 9 finalization mechanics unchanged; only additive action enum extension |
| DONT5 | avoidance | **DONT5** — No auto-invocation of cleanup without explicit operator action. | respected | No auto-invocation; handler requires explicit action=cleanup_merged from operator |
| OOS1 | out_of_scope | **OOS1** — Pre-PR branch synchronization (issue #169). | not_applicable | Out-of-scope per agreement (issue #169 owns) |
| OOS2 | out_of_scope | **OOS2** — Temp/session artifact cleanup (`addArchiveCleanupScanner`). | not_applicable | Out-of-scope per agreement (addArchiveCleanupScanner owns) |
| OOS3 | out_of_scope | **OOS3** — Cross-repo / product-scope cleanup coordination. | not_applicable | Out-of-scope per agreement (single-repo scope C5) |
| OOS4 | out_of_scope | **OOS4** — Downstream consumer repo documentation fixes (e.g. `JRedeker/toolbox` AGENTS.md). | not_applicable | Out-of-scope per agreement (UD4: advance repo only) |

