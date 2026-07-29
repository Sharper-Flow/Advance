# Contract Traceability

**Change ID:** decoupleOrphanAdopter
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-28T23:05:24.512Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin-init.orphan-adopter-restart.test.ts: restart constructs adopter, getOrphanQueueAdoptionDiagnostics() non-null. RED→GREEN T1→T3. |
| AC2 | acceptance_criterion | pass | test | Both sites (spawn :411, restart :881) route through attachWorkerWithAdoption. Tests confirm adopter on both paths. |
| AC3 | acceptance_criterion | pass | test | Fake timers + prototype spy on adoptNextOrphan; advance 10.5s; assert called — proves driven not just constructed. |
| AC4 | acceptance_criterion | pass | test | doctor.ts AC4 guard: worker alive + adoption absent/failing (reason!=kill_switch) → unhealthy finding. Tests: unavailable, driver_error, kill_switch-NOT-flagged. |
| AC5 | acceptance_criterion | pass | test | No worker alive + no adoption → no unhealthy finding, success:true. Test confirms no false alarm. |
| AC6 | acceptance_criterion | pass | test | orphan-session-adoption.itest.ts AC6 case: real Temporal server, attachWorkerWithAdoption seam, workflow becomes queryable via sentinel retry. Not a spy. |
| AC7 | acceptance_criterion | pass | test | AC7 test: two workers via helper — module-level activeOrphanQueueAdopter replaced not duplicated. Singleton invariant unchanged. |
| AC8 | acceptance_criterion | pass | test | AC8 test: ADV_ORPHAN_QUEUE_ADOPTION=0 → status enabled:false, reason:kill_switch, no OrphanQueueAdopter constructed. |
| AC9 | acceptance_criterion | pass | test | No-leak test: 3 consecutive restart cycles, attachmentCount===1, timerCount===1 after each. Teardown-state test: drain clears to no_worker_attached. |
| AC10 | acceptance_criterion | pass | test | AC10 test: getService()=null → status enabled:false, reason:no_temporal_client, diagnostics:null. Typed, not silent null. |
| C1 | constraint | respected | static_check | OrphanQueueAdopter internals unchanged. Driver only calls adoptNextOrphan() on cadence; single-flight/timeout/cap/cooldown all inside adopter. |
| C2 | constraint | respected | static_check | Existing registerQueue surface reused via OrphanAdopterWorker interface. No worker-lifecycle redesign. |
| C3 | constraint | respected | static_check | Construction wrapped in try/catch → construction_failed state, worker proceeds. Driver tick errors caught → driver_error state, driver continues. |
| C4 | constraint | respected | static_check | Driver interval is 10_000ms, matching original heartbeat cadence. |
| C5 | constraint | respected | static_check | All changes confined to plugin host (plugin-init.ts, doctor.ts, orphan-queue-adopter.ts). No Temporal workflow-code changes. |
| C6 | constraint | respected | static_check | teardownWorkerAttachment calls stopDriver before worker.shutdown in drain and handleWorkerExhausted. Init-failure catch also calls teardown before shutdown. |
| C7 | constraint | respected | static_check | Driver tick catches errors → driver_error typed diagnostic. Does not rethrow. Stale client from reinitStsl surfaces as driver_error. |
| DONT1 | avoidance | respected | review | Helper requires InProcessWorker arg; no workerless adoption path exists. |
| DONT2 | avoidance | respected | review | resolveWorkerSingletonPlan unchanged; AC7 regression confirms no second competing worker. |
| DONT3 | avoidance | respected | review | isOrphanQueueAdoptionEnabled() default ON unchanged. AC8 test confirms kill-switch still disables when set to 0. |
| DONT4 | avoidance | respected | review | No restart-advice remedy. The fix makes restart actually work. |
| DONT5 | avoidance | respected | review | Doctor now reports healthy:false when worker alive + adoption absent. No silent healthy:true masking. |
| DONT6 | avoidance | respected | review | No changes to CLI (fixWorkerDependentResume scope) or plugin tool reads (makeToolReadsWorkerFree scope). |
| DONT7 | avoidance | respected | review | Tests verify on current session queue via adoption mechanism, not pre-restart changes. |
| DONT8 | avoidance | respected | review | onBeat retains workerBundleRollMonitor?.checkNow() at :300. Only adoption call removed. Source inspection confirms. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a92c8ca44842 |  | AC1, AC2 | C5, DONT7 |  |
| tk-aa3b6abdfcdb |  |  | C1, C2, C5, DONT8 |  |
| tk-3788bde33e45 |  | AC1, AC2, AC10 | C2, C3, DONT1 |  |
| tk-9a7cc5bf3293 |  | AC3 | C1, C4, DONT8 |  |
| tk-6157d32700bb |  | AC4, AC5 | DONT5 |  |
| tk-f0f56d518c38 |  | AC6 | C5, DONT7 |  |
| tk-036947418d18 |  | AC7, AC8 | DONT2, DONT3 |  |
| tk-6a2c0bb6f909 |  |  | C5 |  |
| tk-c1f697a32f6c |  |  | C3, C7 |  |
| tk-61ed81e10157 |  | AC9 | C6 |  |
