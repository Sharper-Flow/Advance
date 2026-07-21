# Contract Traceability

**Change ID:** fixPoisonedRecovery
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-21T15:24:43.698Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Probe-first pattern applied to all 6 catch-gated tools (verification-evidence, task, design-concern, contract, gate, archive) + #253 archive path. shouldTakeRecoveryBranch gates before fireSignalAndRefresh. AC5 sweep 414/414 pass (tr_mruqwco7_8968572d). |
| SC2 | success_criterion | pass | review | tk-288ea2eded66: completeGateViaRecovery reads durable disk projection for readiness evaluation; disposition clears VERIFICATION_EVIDENCE_MISSING blocker despite stale Temporal state. Regression test in gate.test.ts asserts. |
| SC3 | success_criterion | pass | review | All recovery writes emit reconciliationWarning (RECOVERY_RECONCILIATION_WARNING); recovery_audit captures reason/evidence/recovered_at on gate/disposition/subagent writes. Note: saveRecoveredChangeStatus audit persistence gap flagged for harden (pre-existing). |
| SC4 | success_criterion | pass | review | tk-5c07a5407439: archive handler uses shouldTakeRecoveryBranch + loadChange (disk projection); 37/37 change.archive-phase9.test.ts pass; bundle creation reached without Failed to query Workflow when precise WorkflowNotFoundError evidence supplied. |
| AC1 | acceptance_criterion | pass | test | Per-tool AC5 regression tests (6 tools): verification-evidence.test.ts:240, task.test.ts:771/1615/1830, design-concern.test.ts:276, contract.test.ts:799/829, gate.test.ts:544/626, change.archive-phase9.test.ts:1488. All mock fireSignalAndRefresh to resolve silently and assert probe-first writer fires. |
| AC2 | acceptance_criterion | pass | test | 3 reviewer-flagged C2 sites fixed (change.ts:3657, gate.ts:1295, worktree/state.ts:285); describe() no longer sole authority. C2 regression tests: change.test.ts:4448/4497, gate.test.ts:1857/1902, state-session-lifecycle.test.ts:408. Note: 5+1 additional describe-only sites deferred as follow-up per user scope decision (task.ts L1090/1485/1765, contract.ts L441/678, change.ts:4741 workflow_terminate). |
| AC3 | acceptance_criterion | pass | test | tk-0e8aac2b67dd: target_path routing audit confirmed all 12+ probe-first sites route through target-resolved activeStore. Regression test in verification-evidence.test.ts. |
| AC4 | acceptance_criterion | pass | test | Idempotency tests: change.archive-phase9.test.ts:726 (re-run after interrupted terminal projection), :921 (re-running after PR-merged pending_merge recovery); change.test.ts:5081. Disk-direct writers use content-hash dedup. |
| AC5 | acceptance_criterion | pass | test | AC5 sweep tr_mruqwco7_8968572d: 414/414 pass across 11 recovery-touching files including C2 regression tests. |
| AC6 | acceptance_criterion | pass | test | User-approved structural+deploy interpretation. Deployed bundle SHA 574009ed from trunk HEAD 0882abb4 (PR #275). pokeedge-web temporal_health_ok:true. fixWorktreeViteCache archived (mergeCommitSha=03b0c249). Reviewer READY: report fixPoisonedRecovery|tk-0527666d76fa|adv-reviewer|3. |
| AC7 | acceptance_criterion | pass | test | tk-5c07a5407439: 2 regression tests in change.archive-phase9.test.ts (37/37 pass) asserting archive reaches probe-first bundle creation on poisoned_history + WorkflowNotFoundError without throwing Failed to query Workflow. |
| C1 | constraint | respected | static_check | isPreciseWorkflowRecoveryEvidence remains the authority predicate; all audit fields (recoveryReason, compatibilityReason, priorApprovalEvidence) remain required at gate.ts L708-742, change.ts L2119-2125. No gates weakened. |
| C2 | constraint | respected | static_check | 3 reviewer-flagged sites fixed: describe() not consulted in change.ts archive recovery catch, gate.ts status query catch, worktree/state.ts classifier. 5+1 additional sites documented as follow-up per user-approved 3-site scope (task.ts L1090/1485/1765, contract.ts L441/678, change.ts:4741). |
| C3 | constraint | respected | static_check | Recovery writes are idempotent (content-hash dedup) and record divergence via reconciliationWarning. recovery_audit persisted on gate/disposition/subagent writes. Note: saveRecoveredChangeStatus audit-persistence gap flagged for harden (pre-existing writer, not modified by this change). |
| C4 | constraint | respected | static_check | classifyCompletedOrPoisonedRecovery consumed (not forked); isPreciseWorkflowRecoveryEvidence reused from ../temporal/recovery-classification. fixTemporalQueryRecovery archived on trunk 2026-07-19. |
| C5 | constraint | respected | static_check | Archive path (#253) reuses shouldTakeRecoveryBranch + isPreciseWorkflowRecoveryEvidence — same helpers as sibling tools. No archive-only bypass. |
| C6 | constraint | respected | static_check | shouldTakeRecoveryBranch applied uniformly across 6 catch-gated tools + archive path, mirroring gate.ts probe-first semantics. |
| DONT1 | avoidance | respected | review | No auto-terminate/reset/reseed. shouldTakeRecoveryBranch requires operator-supplied precise evidence (opt-in); classification stays witness-first. |
| DONT2 | avoidance | respected | review | Recovery records divergence (reconciliationWarning) and surfaces recommended next step; no auto-terminalization. |
| DONT3 | avoidance | respected | review | No Temporal Worker Versioning or Reset tooling added. Prevention tracked as P2 backlog bl-F5_tYP9R. |
| DONT4 | avoidance | respected | review | classifyCompletedOrPoisonedRecovery consumed unchanged from fixTemporalQueryRecovery; no re-implementation. |
| DONT5 | avoidance | respected | review | #198 live-wedged workflow served by existing adv_change_workflow_terminate (not modified to add reset semantics). This change stays poisoned-only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-47ced5313eeb | AC1, AC2 |  |  |  |
| tk-ecb1715c33bf | AC1 |  |  |  |
| tk-2a4fdd907f48 | AC1 |  |  |  |
| tk-e686f315c0f6 | AC1 |  |  |  |
| tk-d7247cb94184 | AC1 |  |  |  |
| tk-2d328296ed5d | AC1 |  |  |  |
| tk-288ea2eded66 | AC3 |  |  |  |
| tk-0e8aac2b67dd | AC3 |  |  |  |
| tk-5c07a5407439 | AC7 |  |  |  |
| tk-ce0fe9b766f9 |  | AC4, AC5 |  |  |
| tk-1d58265d9ba9 |  |  | C2 |  |
| tk-0527666d76fa | AC6 |  |  |  |
