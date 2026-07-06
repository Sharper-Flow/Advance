# Acceptance

Reviewed at: 2026-07-06T00:36:30Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | The change-tip SHA is captured at archive time (or recovered from existing checkpoint/task metadata) so reachability does not depend on a live `change/{id}` git ref. | pass | Phase9FinalizationStatusSchema.changeTipSha added (plugin/src/types/changes.ts:800-803). Captured at first pending recordPhase9Status call via execGit rev-parse change/{id} from worktreePath (plugin/src/tools/change.ts:2582-2596). Threaded through verifyReleaseEvidenceFromMain → resolveReleaseReachability → detectSquashMergeByTree. Integration test asserts threading (change.archive-phase9.test.ts: phase9 retry threads persisted changeTipSha). |
| SC2 | success_criterion | Reachability detection survives branch deletion via structural proof: persisted tip + merge-base / patch-id / PR-merge metadata. | pass | detectSquashMergeByTree uses changeTipSha as tipRef when provided (git-finalize.ts:1215-1218: tipRef = deps.changeTipSha ?? change/{id}). RED test confirmed failure before GREEN, passes after. 3 new tests: unit (git-finalize.test.ts: deleted branch + changeTipSha), integration (change.archive-phase9.test.ts: threads changeTipSha), AC4 remediation pointer. Full suite: 124 tests pass. |
| SC3 | success_criterion | The shipped-invariant bar is preserved: never mark release done without positive reachability/merge evidence. | pass | Tree-SHA equivalence is positive structural proof: change-tip is content-addressed, matching trunk tree requires identical content. No path marks release done without positive reachability evidence. Blocked path (verifyReleaseEvidenceFromMain:580-594) returns status:blocked with CHANGE_BRANCH_NOT_REACHABLE when no proof found. |
| C1 | constraint | Do not weaken the shipped-invariant bar: never mark release done without positive reachability/merge evidence. | respected | Reachability detection unchanged for existing proof paths (local_merge, origin_default, pr_merged via gh). New tip-based tree-SHA adds a positive-proof path; does not weaken existing checks. Blocked path enriched with adv_change_status_repair pointer but still fails closed (status: blocked, no release gate completion). |
| C2 | constraint | No new external dependency. | respected | No new npm dependencies. All detection uses git CLI (rev-parse, log) and existing gh queries. execGit from plugin/src/utils/git.ts (already imported in change.ts). pnpm-lock.yaml unchanged. |
| C3 | constraint | Keep worktree/branch safety intact; do not auto-delete or auto-create branches as a side effect of detection. | respected | Detection is read-only: git rev-parse {tip}^{tree}, git log --format=%H %T -50 {defaultBranch}. No git branch, git push, git checkout, or git merge calls in the new code paths. Tip capture reads rev-parse only. |
| C4 | constraint | Persisted tip must come from a trusted source (worktree HEAD at archive time, or task checkpoint `expectedHeadSha`); never trust an attacker-controllable input. | respected | Tip captured from ADV-owned worktree on verified change/{id} branch via execGit (plugin/src/tools/change.ts:2589). The worktree is validated by validateChangeWorktree in finalizeRelease. SHA is content-addressed git output, not user input. Not attacker-controllable. |
| OOS1 | out_of_scope | Worktree cleanup timeout on poisoned workflows (separate concern; note as related follow-up). | missing |  |
| OOS2 | out_of_scope | Dangling-task-commit reachability audit (#109) — related but distinct. | missing |  |
| OOS3 | out_of_scope | Phase-9 behavior when the archive bundle itself is missing (separate recovery path). | missing |  |

