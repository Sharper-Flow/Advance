# Contract Traceability

**Change ID:** fixPhase9PrDetection
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T22:56:56.859Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | tr_mrb8zyic_c95f3daa: 241 changed-scope archive/gate/change tests passed; PR-mode retry returns shipped from merged PR proof after branch auto-delete. |
| SC2 | success_criterion | pass | review | Phase9FinalizationStatus adds repo and preservePhase9Evidence carries repo/prNumber/prUrl/route/changeTipSha/autoMergeArmed across transitions; schemas:check passed tr_mrb8yx44_33a0b150. |
| SC3 | success_criterion | pass | review | Targeted tests cover missing PR proof and fail-closed classification; tr_mrb8zyic_c95f3daa passed. |
| AC1 | acceptance_criterion | pass | test | git-finalize/archive-gate regression tests passed in tr_mrb8zyic_c95f3daa: missing prNumber + deleted branch + discoverable merged PR returns shipped PR proof. |
| AC2 | acceptance_criterion | pass | test | PR-number-present MERGED path covered by archive/gate tests; tr_mrb8zyic_c95f3daa passed without requiring live origin/change branch. |
| AC3 | acceptance_criterion | pass | test | Missing prNumber + no merged proof path returns pr_missing_merge_proof / blocked details instead of PR_NOT_MERGED; tr_mrb8zyic_c95f3daa passed. |
| AC4 | acceptance_criterion | pass | test | Preservation tests plus static inspection confirm phase9_status durable fields survive pending_merge/failed/done; tr_mrb8zyic_c95f3daa and tr_mrb8yx44_33a0b150 passed. |
| AC5 | acceptance_criterion | pass | test | gate.release-enforcement tests passed in tr_mrb8zyic_c95f3daa; PR archive release gate uses merged PR reachability before branch-push checks. |
| AC6 | acceptance_criterion | pass | test | Regression tests cover the issue #202 string `PR merge state requires repo and prNumber`; changed-scope suite passed tr_mrb8zyic_c95f3daa. |
| AC7 | acceptance_criterion | pass | test | Existing direct-route, pending auto-merge, unmerged PR, no-remote, and push-unverified tests remain green in git-finalize/gate suites; tr_mrb8zyic_c95f3daa. |
| AC8 | acceptance_criterion | pass | test | Phase9FinalizationStatusSchema gained optional repo; public schema check passed tr_mrb8yx44_33a0b150. |
| C1 | constraint | respected | static_check | Reachability returns shipped only for merged PR state, origin/default reachability, local merge, or tree/tip proof; no branch-absence-only success path observed. |
| C2 | constraint | respected | static_check | PR-mode tests prove branch auto-delete/no live origin/change branch does not block when merged PR proof exists; tr_mrb8zyic_c95f3daa. |
| C3 | constraint | respected | static_check | Implementation reads GitHub PR state via gh view/list only; no code path mutates PR state or repo merge policy. |
| C4 | constraint | respected | static_check | ADV state accessed through tools/signals and phase9_status helpers; no direct ADV state-file read/edit path added. |
| C5 | constraint | respected | static_check | Changes remain in tool/helper layers; Temporal workflow code untouched; pnpm check passed tr_mrb8yx44_33a0b150. |
| C6 | constraint | respected | static_check | Verification used adv_run_test and repo-local bin/oc-test targeted plus pnpm --dir plugin run check; runs tr_mrb8zyic_c95f3daa and tr_mrb8yx44_33a0b150 passed. |
| C7 | constraint | respected | static_check | Executive summary preserves source-vs-deployed runtime boundary: live ADV tool behavior needs build/deploy/restart before current host validation. |
| DONT1 | avoidance | respected | review | Missing PR metadata now returns missing-proof classification / discoverable PR success, not PR_NOT_MERGED; tr_mrb8zyic_c95f3daa passed. |
| DONT2 | avoidance | respected | review | Branch auto-delete after squash merge is handled through merged PR/default/tip proof; no manual branch resurrection required in tests. |
| DONT3 | avoidance | respected | review | Release gate still fails closed when merged PR/default/tip proof is absent; no unrelated release readiness checks bypassed. |
| DONT4 | avoidance | respected | review | Touched implementation files are archive/gate/schema/tests for #202; no #192/#198 target_path or disk-authoritative recovery work implemented. |
| DONT5 | avoidance | respected | review | No heuristic title matching added; PR discovery uses GitHub PR head branch and PR merge state plus structural git/tree proof. |
| OOS1 | out_of_scope | respected | not_applicable | No full disk-authoritative recovery/reset tooling added. |
| OOS2 | out_of_scope | respected | not_applicable | No cross-project target_path artifact/close routing cleanup implemented. |
| OOS3 | out_of_scope | respected | not_applicable | No archive worktree cleanup policy change implemented. |
| OOS4 | out_of_scope | respected | not_applicable | No GitHub branch protection or repository settings changed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-6b5a512d2bd4 |  | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C6 |  |
| tk-95a8ba76002e | SC2, AC4, AC8 | AC4, AC8 | C4, C5 |  |
| tk-261c0a2ad20f | SC1, SC3, AC1, AC2, AC3, AC6, AC7 | AC1, AC2, AC3, AC6, AC7 | C1, C2, C3, DONT1, DONT2 |  |
| tk-55adf23bc63c | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6 | AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C4, C5, DONT2, DONT3 |  |
| tk-38ceecdbb115 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C6, C7 |  |
