# Contract Traceability

**Change ID:** fixArchiveReleaseOrdering
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T07:09:03Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | change.archive-phase9.test.ts verifies release gate signal after Phase 9 and before store.changes.save; output releaseGate done. Full pnpm test passed after review remediation. |
| AC2 | acceptance_criterion | pass | test | Blocked-finalization tests assert no release signal/status save/issue closure when Phase 9 blocks; no-worktree missing-push test blocks. Git finalization helpers verify reachability/push. |
| AC3 | acceptance_criterion | pass | test | Existing-bundle/no-worktree retry test verifies main-checkout evidence path; workflow-completed and mid-poll WorkflowNotFoundError tests verify disk-projection release recovery. |
| AC4 | acceptance_criterion | pass | test | change.ts orders release gate, status save, then removeChangeDir/advWorktreeCleanup; tests assert save is not called on blocked finalization/release gate. Cleanup errors are warning-only after durable state. |
| AC5 | acceptance_criterion | pass | test | adv-autonomy-quality-assets.test.ts and change.archive-phase9.test.ts verify Continue from main/default guidance and continueFrom output. Docs state terminal-neutral/no Warp dependency. |
| AC6 | acceptance_criterion | pass | test | Existing-bundle path skips archiveChange/finalizeRelease; already-done release gate skips signal. finalizeRelease/gate tests cover already-reachable and push safeguards; close issue remains after durable state. |
| AC7 | acceptance_criterion | pass | test | Post-review verification passed: targeted archive recovery tests, pnpm run check, pnpm run build, full pnpm test, and adv_change_validate strict:true with expected NO_DELTAS warning. |
| C1 | constraint | respected | static_check | completeReleaseGateAfterFinalization rejects statuses other than shipped/pr_pushed; verifyReleaseEvidenceFromMain requires reachability and push checks before release recovery. |
| C2 | constraint | respected | static_check | No manual ADV state-file edits or Temporal DB access. Recovery uses typed storage helper saveChange only inside _recovery-writers with required authorization reason/evidence. |
| C3 | constraint | respected | static_check | Release gate normal path uses gateCompletedSignal/querySignal/fireSignalAndRefresh; no defineUpdate references introduced. Existing workflow-bundle boundary tests passed. |
| C4 | constraint | respected | static_check | Touched code did not modify task completion semantics; task status logic remained out of scope. Review remediation used checkpoint only for git cleanliness. |
| C5 | constraint | respected | static_check | continueFrom is terminal-neutral {path, branch}; docs explicitly say correctness does not depend on Warp or terminal navigation APIs. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No broad archive workflow rewrite performed; changes were localized to archive Phase 9 ordering/recovery/docs/tests. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No Warp endpoint smoke behavior changed; only terminal-neutral wayfinding docs/output were updated. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No new release modes added; existing direct/PR archive modes retained. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-921fe91f1c10 | AC1, AC2, AC4, AC6 | AC1, AC2, AC4, AC6 | C1, C2, C3, C5 |  |
| tk-1a808cbb5a80 | AC2, AC3, AC4, AC6 | AC2, AC3, AC4, AC6 | C1, C2, C3, C5 |  |
| tk-c3546fc9d66e | AC5, AC6 | AC5, AC6 | C4, C5 |  |
| tk-99075fbdf906 | AC7 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5 |  |
