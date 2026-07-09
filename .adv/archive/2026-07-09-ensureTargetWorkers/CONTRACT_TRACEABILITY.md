# Contract Traceability

**Change ID:** ensureTargetWorkers
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-09T04:35:41.858Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | executeTargetWorkerRestart resolves target trust via resolveTargetProject({mutation:true}) and establishes serviceability from driving session; temporal-ops.test.ts cheap ensure + full restart tests prove trusted and confirmed-untrusted paths. |
| SC2 | success_criterion | pass | review | Success and failure responses include serviceability, _freshness, workerDiagnostics, worker_lock, stsl, expectedQueue, recommendedNextAction; temporal-ops.test.ts serviceability failure test verifies bounded envelope. |
| SC3 | success_criterion | pass | review | formatTargetProjectContext emits authority:'disk_snapshot_non_authoritative' and warning for disk-snapshot stateMode; target-project.test.ts trusted and untrusted disk-snapshot tests. |
| AC1 | acceptance_criterion | pass | test | temporal-ops.test.ts: target_path cheap ensure test returns success:true, projectId='target456', expectedQueue='advance-target456', _projectContext present. |
| AC2 | acceptance_criterion | pass | test | temporal-ops.test.ts: untrusted target_path without confirmation fails with TargetProjectError before restartCurrentProjectTemporalWorker or ensureProjectTemporalQueue calls. |
| AC3 | acceptance_criterion | pass | test | temporal-ops.test.ts: serviceability failure returns success:false, errorClass='WorkerRestartVerificationTimeout', expectedQueue, serviceability, _freshness, _projectContext, stsl, recommendedNextAction with adv_temporal_diagnose. |
| AC4 | acceptance_criterion | pass | test | withTargetPathStore temporal-required branch opens createStore with temporalBundle and stateMode:'temporal'; unchanged by this change, and target restart/ensure makes precondition achievable. |
| AC5 | acceptance_criterion | pass | test | target-project.test.ts: disk-snapshot trusted output has authority='disk_snapshot_non_authoritative' and warning; untrusted output merges non-authoritative + untrusted warnings. |
| AC6 | acceptance_criterion | pass | test | withTargetPathStore snapshot-ok branch calls createLegacyStore only, no getService/ensureProjectTemporalQueue/restartCurrentProjectTemporalWorker; rq-targetReadAuthority01.2 comment citation. |
| AC7 | acceptance_criterion | pass | test | temporal-ops.test.ts: approvedLockReclaim:true without approvalEvidence fails with ApprovalRequired before restart; lock approval evidence passed to restartCurrentProjectTemporalWorker. |
| AC8 | acceptance_criterion | pass | test | temporal-ops.test.ts: target tests assert projectId='target456', expectedQueue='advance-target456', _projectContext.projectId='target456'; resolveTargetProject derives from target_path git root. |
| AC9 | acceptance_criterion | pass | test | rq-targetWorkerLifecycle01 in advance-meta spec.json + docs mirror; rq-targetReadAuthority01 in advance-workflow spec.json + docs mirror; ADV_INSTRUCTIONS.md target_path matrix updated; docs/temporal-recovery.md updated; tool description includes target_path. |
| C1 | constraint | respected | static_check | resolveTargetProject mutation:true throws TargetProjectError for untrusted without hasConfirmation; FIELD_POLICIES blank:omit for confirmationEvidence, handler validates contextually. |
| C2 | constraint | respected | static_check | approvedLockReclaim + approvalEvidence validation preserved in executeTargetWorkerRestart; classifySuspectWorkerLock and restartFailureNextAction unchanged. |
| C3 | constraint | respected | static_check | waitForRestartServiceability called with readWorkerRestartVerifyTimeoutMs(); no unbounded loops in executeTargetWorkerRestart. |
| C4 | constraint | respected | static_check | target_path absent → existing current-project restart path unchanged; temporal-ops.test.ts current-project restart test passes. |
| C5 | constraint | respected | static_check | withTargetPathStore snapshot-ok branch and withOptionalTargetPathStore do not call worker lifecycle functions; rq-targetReadAuthority01.2 citation. |
| C6 | constraint | respected | static_check | TargetProjectOutputContext.authority is optional; existing stateMode/trusted/trustSource/root/projectId fields preserved; target-project.test.ts backward-compatibility tests for temporal/scaffold/current modes. |
| DONT1 | avoidance | respected | review | executeTargetWorkerRestart establishes target serviceability from driving session via ensureProjectTemporalQueue or restartCurrentProjectTemporalWorker; no manual foreign session required. |
| DONT2 | avoidance | respected | review | formatTargetProjectContext marks disk-snapshot with authority='disk_snapshot_non_authoritative' and warning text. |
| DONT3 | avoidance | respected | review | snapshot-ok path in withTargetPathStore does not call getService, ensureProjectTemporalQueue, restartCurrentProjectTemporalWorker, or worker-lock paths. |
| DONT4 | avoidance | respected | review | Trust gate via resolveTargetProject mutation:true; lock approval via approvedLockReclaim+approvalEvidence; no bypass paths introduced. |
| DONT5 | avoidance | respected | review | No changes to epic membership tools or cross-project routing semantics; only adv_temporal_worker_restart and target-project formatting affected. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No Temporal or ADV storage replacement; existing storage layers unchanged. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No product-wide orchestration changes; only existing target_path surfaces extended. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No GitHub issue/Project automation changes. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No frontend/browser UI changes. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f2e442d10c5e | AC9 | AC9 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-8c167525833f | AC1, AC2, AC3, AC7, AC8, SC1, SC2 | AC1, AC2, AC3, AC7, AC8, SC1, SC2 | C1, C2, C3, C4, DONT1, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-1fa6281f46f2 | AC1, AC3, AC4, AC7, AC8, SC1, SC2 | AC1, AC3, AC4, AC7, AC8, SC1, SC2 | C1, C2, C3, C4, DONT1, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-c9f5748f51e1 | AC5, AC6, SC3 | AC5, AC6, SC3 | C5, C6, DONT2, DONT3, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-19fb26d78e5a |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 | OOS1, OOS2, OOS3, OOS4 |  |
