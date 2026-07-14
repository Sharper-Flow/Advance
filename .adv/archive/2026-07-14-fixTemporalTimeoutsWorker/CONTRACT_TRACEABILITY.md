# Contract Traceability

**Change ID:** fixTemporalTimeoutsWorker
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-14T02:35:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tool-registry.test.ts + gate-timeout.test.ts: gate_complete registered with timeoutMs:30_000 + onToolTimeout classifier (formatGateCompleteTimeoutResult, probe-free advisory). Reviewer confirmed sound. RED tr_mrjvl85j → GREEN tr_mrjvmlk9 (35/35). |
| AC2 | acceptance_criterion | pass | test | tool-registry.test.ts: archive override guard (extractRegistrationBlock source inspection, asserts timeoutMs>300_000 + onToolTimeout). RED proven by simulated removal; GREEN 29/29. Override already in source+deployed dist. |
| AC3 | acceptance_criterion | pass | test | archive-phase9-splitbrain.itest.ts against LIVE Temporal (TestWorkflowEnvironment + real changeWorkflow + real bundle). Found+fixed real bug: phase9 guard was falsy on unset status → recordPhase9Status skipped on split-brain recovery. Fixed guard to !== "done" && !recoveryMutation. RED tr_mrk0grli (phase9 undefined) → GREEN tr_mrk0k5x9 (phase9 done). Reviewer confirmed guard correctness. |
| AC4 | acceptance_criterion | pass | test | worker.test.ts: parent-liveness watchdog (3s, process.kill(ppid,0) capture-once, ESRCH⇒exit(1), EPERM⇒alive, unref'd). Dead spawnTemporalWorkerProcess deleted (zero callers). Reviewer remediated: stop watchdog on clean shutdown. 62/62 targeted pass. |
| AC5 | acceptance_criterion | pass | test | worker-process-probe.test.ts + status-health.worker-processes.test.ts: adv_status health surfaces worker_processes {workerCount, orphanCount, processes:[{pid,ppid,orphan}]} via /proc scan + ESRCH orphan check. Reviewer remediated: abort-aware /proc census. 92/92 pass. |
| C1 | constraint | respected | static_check | Watchdog is in-child (worker.ts runTemporalWorkerFromEnv); no change to the out-of-process Node-worker spawn model (worker-multi.ts detached:false untouched). Reviewer confirmed. |
| C2 | constraint | respected | static_check | No Temporal server, STSL client, or workflow signal/query surface changes. Gate override is a tool-registry safeExecute option; watchdog is host-side process management. Reviewer confirmed. |
| C3 | constraint | respected | static_check | Only the outer safeExecute timeoutMs for gate_complete changed (10s→30s). Inner git budgets (archive push 300s, etc.) untouched. |
| C4 | constraint | respected | static_check | Existing tools unchanged except the targeted gate_complete override. Archive already had its override. Legacy/guard tests green. Reviewer confirmed no regressions. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0c9938fac4dd | AC4 |  |  |  |
| tk-50840bfcc8e0 | AC1 |  |  |  |
| tk-9cbe6bcfc5f1 | AC2 |  |  |  |
| tk-f0001e2dc303 | AC5 |  |  |  |
| tk-8326341fd053 | AC3 |  |  |  |
| tk-f18d05fcd6d0 |  | AC5 | C1, C2, C3, C4 |  |
