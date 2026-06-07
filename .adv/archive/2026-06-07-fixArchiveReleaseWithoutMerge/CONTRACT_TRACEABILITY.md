# Contract Traceability

**Change ID:** fixArchiveReleaseWithoutMerge
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-07T05:28:33.926Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review attempt 2 READY. `completeReleaseGateAfterFinalization` accepts only shipped evidence; release proof now routes through `resolveReleaseReachability` for no_remote/origin/default/merged PR. Full + smoke passed. |
| SC2 | success_criterion | pass | review | `finalizeRelease` PR path uses `completeProtectedBranchViaPullRequest`; pending auto-merge persists `pending_merge` and leaves release incomplete. Covered by git-finalize and change.archive-phase9 tests. |
| SC3 | success_criterion | pass | review | Remote push failure path routes to PR pending or blocked; docs/voice use `Pending auto-merge.` / `Blocked.`. Reviewer attempt 2 READY; targeted and full tests passed. |
| SC4 | success_criterion | pass | review | `phase9:"skip"` calls `verifyReleaseEvidenceFromMain`; release recovery uses route-aware proof. `change.test.ts` recovery fixtures now create structural no-remote proof; full suite passed. |
| SC5 | success_criterion | pass | review | `adv_archive_repair` scan/redrive added and covered by `change.archive-repair.test.ts`; cross-targeted release-finalization suite passed. |
| AC1 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts ...` PASS; tests cover `verifyChangeBranchReachableFromOrigin` and origin/default release proof. |
| AC2 | acceptance_criterion | pass | test | `change.archive-phase9.test.ts` and `git-finalize.test.ts` PASS; protected push rejection returns pending_merge or blocked, no archive save/issue closure. |
| AC3 | acceptance_criterion | pass | test | `git-finalize.test.ts` PASS for PR open/reuse/auto-merge; `change.archive-phase9.test.ts` PASS for pending_merge persistence without archive. |
| AC4 | acceptance_criterion | pass | test | `change.test.ts` PASS; phase9 skip/recovery tests now require structural no-remote proof fixtures and reject missing proof paths. |
| AC5 | acceptance_criterion | pass | test | `gate.release-enforcement.test.ts` included in cross-targeted suite PASS; recovery path uses shared release reachability proof. |
| AC6 | acceptance_criterion | pass | test | `archive-release-finalization-assets.test.ts`, `handoff-footer-drift.test.ts`, and `adv-autonomy-quality-assets.test.ts` PASS; command/voice docs restrict `Merged locally.` to no origin. |
| AC7 | acceptance_criterion | pass | test | `change.archive-repair.test.ts` and `git-finalize.test.ts` PASS; detector/re-drive covers archived-but-unmerged branch, PR reuse, auto-merge, no force-push. |
| AC8 | acceptance_criterion | pass | test | Spec JSON, spec docs, adv-archive command, command voice, and ADV_INSTRUCTIONS updated. Asset tests, full suite, and smoke passed. |
| C1 | constraint | respected | static_check | Review found no force-push path. Re-drive/open PR code uses push branch and PR reuse; tests assert no force-push behavior. |
| C2 | constraint | respected | static_check | Push rejection path resets/reconciles main to origin before PR handoff; no remote-backed local merged-but-unpushed terminal success remains. |
| C3 | constraint | respected | static_check | Smoke passed: schemas:check, typecheck, lint, format:check. Workflow-boundary tests passed in full suite. |
| C4 | constraint | respected | static_check | `runGh` failures map to blocked/manual paths; PR auto-merge unavailable returns `Blocked.`. Tests cover gh unavailable/auth/manual outcomes. |
| C5 | constraint | respected | static_check | All orchestrator verification used `bin/oc-test`: targeted, full, and smoke. |
| DONT1 | avoidance | respected | review | No operational branch landing performed; code/tests/docs only in ADV worktree. |
| DONT2 | avoidance | respected | review | No polling daemon added; design relies on GitHub auto-merge plus scan/re-drive tool. |
| DONT3 | avoidance | respected | review | No pokeedge/web repo files changed; all changes are in Advance plugin/spec/docs. |
| OOS1 | out_of_scope | not_applicable | not_applicable | pokeedge/web Conventional Commit Check exemption intentionally not implemented in this repo change. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Existing stranded branches were not landed; this change only adds detector/re-drive capability. |
| OOS3 | out_of_scope | not_applicable | not_applicable | ADV operational redeploy to consuming repos not performed; source change only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a098e525b7db | SC1, SC2, SC3, AC1, AC3, AC6 | AC1 | C1, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-4f99e6b996df | SC1, SC2, SC3, AC2, AC3, AC6 | AC2, AC3, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-f26b1aa86943 | SC1, SC4, AC4, AC5 | AC4, AC5 | C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-b588db3c6f3c | SC5, AC7 | AC7 | C1, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-36c50b2a92a7 | SC3, AC6, AC8 | AC6, AC8 | C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-1c704b8091e0 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 | C5, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
