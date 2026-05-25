# Acceptance

Reviewed at: 2026-05-22T07:09:03Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_archive phase9:"run"` completes an auto-managed change with both `change.status === "archived"` and `gates.release.status === "done"`. | pass | change.archive-phase9.test.ts verifies release gate signal after Phase 9 and before store.changes.save; output releaseGate done. Full pnpm test passed after review remediation. |
| AC2 | acceptance_criterion | Release completion is recorded only after Phase 9 reachability/push evidence exists; missing merge or missing push still blocks. | pass | Blocked-finalization tests assert no release signal/status save/issue closure when Phase 9 blocks; no-worktree missing-push test blocks. Git finalization helpers verify reachability/push. |
| AC3 | acceptance_criterion | Retrying archive after a completed workflow or already-written archive bundle can reconcile stale release metadata without manual worktree recreation. | pass | Existing-bundle/no-worktree retry test verifies main-checkout evidence path; workflow-completed and mid-poll WorkflowNotFoundError tests verify disk-projection release recovery. |
| AC4 | acceptance_criterion | Worktree cleanup happens only after durable release/archive state is recorded, or cleanup is delayed/queued when needed to preserve recovery context. | pass | change.ts orders release gate, status save, then removeChangeDir/advWorktreeCleanup; tests assert save is not called on blocked finalization/release gate. Cleanup errors are warning-only after durable state. |
| AC5 | acceptance_criterion | Archive terminal report or command guidance includes a clear “continue from main/default-branch checkout” instruction after successful cleanup; no hard Warp API dependency. | pass | adv-autonomy-quality-assets.test.ts and change.archive-phase9.test.ts verify Continue from main/default guidance and continueFrom output. Docs state terminal-neutral/no Warp dependency. |
| AC6 | acceptance_criterion | Healthy archive paths remain idempotent and do not double-merge, double-push, or weaken linked-issue closure safeguards. | pass | Existing-bundle path skips archiveChange/finalizeRelease; already-done release gate skips signal. finalizeRelease/gate tests cover already-reachable and push safeguards; close issue remains after durable state. |
| AC7 | acceptance_criterion | Targeted regression tests, `pnpm run check`, `pnpm run build`, and full `pnpm test` pass. | pass | Post-review verification passed: targeted archive recovery tests, pnpm run check, pnpm run build, full pnpm test, and adv_change_validate strict:true with expected NO_DELTAS warning. |
| C1 | constraint | Do not mark release complete without structural Phase 9 evidence. | respected | completeReleaseGateAfterFinalization rejects statuses other than shipped/pr_pushed; verifyReleaseEvidenceFromMain requires reachability and push checks before release recovery. |
| C2 | constraint | Do not use direct ADV state-file edits or Temporal DB surgery. | respected | No manual ADV state-file edits or Temporal DB access. Recovery uses typed storage helper saveChange only inside _recovery-writers with required authorization reason/evidence. |
| C3 | constraint | Preserve signal/query-only change workflow architecture; no `defineUpdate` reintroduction. | respected | Release gate normal path uses gateCompletedSignal/querySignal/fireSignalAndRefresh; no defineUpdate references introduced. Existing workflow-bundle boundary tests passed. |
| C4 | constraint | Keep task-completion semantics out of scope because another agent owns `fixTaskCompletion` / `fixCompletionSemantics`. | respected | Touched code did not modify task completion semantics; task status logic remained out of scope. Review remediation used checkpoint only for git cleanliness. |
| C5 | constraint | Do not couple correctness to Warp or any terminal-specific navigation feature. | respected | continueFrom is terminal-neutral {path, branch}; docs explicitly say correctness does not depend on Warp or terminal navigation APIs. |
| OOS1 | out_of_scope | Broad archive workflow rewrite. | not_applicable | No broad archive workflow rewrite performed; changes were localized to archive Phase 9 ordering/recovery/docs/tests. |
| OOS2 | out_of_scope | Warp endpoint smoke failures unrelated to post-archive wayfinding. | not_applicable | No Warp endpoint smoke behavior changed; only terminal-neutral wayfinding docs/output were updated. |
| OOS3 | out_of_scope | New release modes beyond existing direct/PR archive modes. | not_applicable | No new release modes added; existing direct/PR archive modes retained. |

