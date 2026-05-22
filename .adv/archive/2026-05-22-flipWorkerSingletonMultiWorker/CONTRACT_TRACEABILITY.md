# Contract Traceability

**Change ID:** flipWorkerSingletonMultiWorker
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-22T07:30:50.648Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Default flipped to false in types/project.ts. Existing fast path (plugin-init.ts:92) already handles singleton=false correctly. Multi-session test coverage via plugin-init.worker-singleton.test.ts with workerSingletonEnforce: false. |
| AC2 | acceptance_criterion | pass | test | Existing tests with workerSingletonEnforce: true still pass (plugin-init.worker-singleton.test.ts lines 35-108). Lock acquisition path unchanged. C3 constraint verified. |
| AC3 | acceptance_criterion | pass | test | New test in temporal-ops.test.ts: when worker_alive=false but probeTaskQueuePollers returns fresh, recommendation says 'serviceable via peer workers' not 'run adv_temporal_restart'. 8 temporal-ops tests pass. |
| AC4 | acceptance_criterion | pass | test | pnpm run check: clean (typecheck+lint+format). pnpm test: 2916/2917 pass. 1 pre-existing failure (adv-tron-assets.test.ts) confirmed on main. |
| AC5 | acceptance_criterion | pass | test | docs/specs/advance-meta.md: rq-workerSingleton01 changed to SHOULD with opt-in preamble, rq-advcfg01.2 updated to 'defaults false', rq-temporalConcurrentLoad01 scoped to singleton=true. |
| C1 | constraint | respected | static_check | worker-lock.ts and worker-heartbeat.ts not modified. No imports removed from any file. |
| C2 | constraint | respected | static_check | No changes to temporal/workflows.ts, contracts.ts, or any signal/query definitions. |
| C3 | constraint | respected | static_check | withStabilityFeatureDefaults preserves explicit true values via ternary. Existing tests with workerSingletonEnforce: true pass. |
| C4 | constraint | respected | static_check | No migration code. Change is plugin-init-time only. No workflow state touched. |
| DONT1 | avoidance | respected | review | worker-lock.ts and worker-heartbeat.ts untouched. No stubs or deletions. |
| DONT2 | avoidance | respected | review | createMultiWorker and createOutOfProcessWorker not modified. |
| DONT3 | avoidance | respected | review | Reused existing worker_singleton_enforce flag. No new flags introduced. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-3727f4d72113 | AC1, AC2 | AC4 | C3, C4, DONT3 |  |
| tk-802b8a40e12f | AC3 | AC3 | C2, C4 |  |
| tk-ef5f3e99a44c | AC5 | AC5 | DONT1 |  |
| tk-3ffbd515232c |  | AC4 | C1, C3, DONT1 |  |
| tk-06a9c82391fe |  | AC1, AC2, AC4 | C1, C2, C3, DONT1, DONT2 |  |
