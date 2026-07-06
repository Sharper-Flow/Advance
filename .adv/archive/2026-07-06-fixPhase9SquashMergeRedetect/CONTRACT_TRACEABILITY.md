# Contract Traceability

**Change ID:** fixPhase9SquashMergeRedetect
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-06T00:40:00Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Phase9FinalizationStatusSchema.changeTipSha added (changes.ts:800-803). Captured at first pending recordPhase9Status via execGit rev-parse change/{id} from worktreePath (change.ts:2582-2596). Threaded through verifyReleaseEvidenceFromMain → resolveReleaseReachability → detectSquashMergeByTree. Integration test confirms threading. |
| SC2 | success_criterion | pass | review | detectSquashMergeByTree uses changeTipSha as tipRef when provided (git-finalize.ts:1215-1218). RED→GREEN TDD cycle confirmed. 3 new tests: unit, integration, AC4 remediation. 124 tests pass across 3 files. |
| SC3 | success_criterion | pass | review | Tree-SHA equivalence is positive structural proof. No path marks release done without positive reachability evidence. Blocked path returns status:blocked with CHANGE_BRANCH_NOT_REACHABLE when no proof found. |
| C1 | constraint | respected | static_check | Existing proof paths unchanged. New tip-based tree-SHA adds positive-proof path only. Blocked path enriched with adv_change_status_repair pointer but still fails closed. |
| C2 | constraint | respected | static_check | No new npm dependencies. Uses git CLI (rev-parse, log) and existing gh queries. execGit already imported in change.ts. pnpm-lock.yaml unchanged. |
| C3 | constraint | respected | static_check | Detection is read-only: git rev-parse {tip}^{tree}, git log --format=%H %T -50. No git branch/push/checkout/merge calls in new paths. |
| C4 | constraint | respected | static_check | Tip captured from ADV-owned worktree on verified change/{id} branch via execGit (change.ts:2589). SHA is content-addressed git output. Not attacker-controllable. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Worktree cleanup timeout on poisoned workflows not addressed. Separate concern. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Dangling-task-commit reachability audit (#109) not addressed. Related but distinct. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Phase-9 behavior when archive bundle itself is missing not addressed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-91de5775a291 | C2, C4 | SC1 |  |  |
| tk-1028cb633236 | SC1 | SC2 |  |  |
| tk-da7db370e096 | SC1, SC2 |  | C1, C3 |  |
| tk-0d0ff541fbe5 | SC1 |  |  |  |
| tk-1bfca44d20be | SC2 |  | C1 |  |
| tk-9cabb2f92d4a | SC2 |  | C1 |  |
| tk-742957f04f6e |  | SC1, SC2, SC3, C1, C2, C3, C4 |  |  |
| tk-12b358d06b4f | SC2 |  |  |  |
