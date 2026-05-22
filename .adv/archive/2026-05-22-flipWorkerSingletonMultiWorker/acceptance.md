# Acceptance

Reviewed at: 2026-05-22T07:30:50.648Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **AC1**: With default config (no `worker_singleton_enforce` in project.json), two concurrent OpenCode sessions on the same project each spawn their own worker and both report `serviceable` status — no session reports "degraded" or "not alive" | pass | Default flipped to false in types/project.ts. Existing fast path (plugin-init.ts:92) already handles singleton=false correctly. Multi-session test coverage via plugin-init.worker-singleton.test.ts with workerSingletonEnforce: false. |
| AC2 | acceptance_criterion | **AC2**: With `worker_singleton_enforce: true` in project.json, second session takes client role and does not spawn a worker — behavior identical to current production | pass | Existing tests with workerSingletonEnforce: true still pass (plugin-init.worker-singleton.test.ts lines 35-108). Lock acquisition path unchanged. C3 constraint verified. |
| AC3 | acceptance_criterion | **AC3**: `adv_temporal_diagnose` does not recommend "run adv_temporal_restart" when worker_alive=false but queue has active server-side pollers | pass | New test in temporal-ops.test.ts: when worker_alive=false but probeTaskQueuePollers returns fresh, recommendation says 'serviceable via peer workers' not 'run adv_temporal_restart'. 8 temporal-ops tests pass. |
| AC4 | acceptance_criterion | **AC4**: All tests pass (`pnpm test`, `pnpm run check`) | pass | pnpm run check: clean (typecheck+lint+format). pnpm test: 2916/2917 pass. 1 pre-existing failure (adv-tron-assets.test.ts) confirmed on main. |
| AC5 | acceptance_criterion | **AC5**: `docs/specs/advance-meta.md` shows `rq-workerSingleton01` as SHOULD with opt-in description | pass | docs/specs/advance-meta.md: rq-workerSingleton01 changed to SHOULD with opt-in preamble, rq-advcfg01.2 updated to 'defaults false', rq-temporalConcurrentLoad01 scoped to singleton=true. |
| C1 | constraint | **C1**: `worker-lock.ts` and `worker-heartbeat.ts` modules must remain importable and functional — no deletion | respected | worker-lock.ts and worker-heartbeat.ts not modified. No imports removed from any file. |
| C2 | constraint | **C2**: No changes to Temporal workflow definitions, signal contracts, or query schemas | respected | No changes to temporal/workflows.ts, contracts.ts, or any signal/query definitions. |
| C3 | constraint | **C3**: Existing project.json files with explicit `worker_singleton_enforce: true` must continue to work identically | respected | withStabilityFeatureDefaults preserves explicit true values via ternary. Existing tests with workerSingletonEnforce: true pass. |
| C4 | constraint | **C4**: No workflow state migration — this is a plugin-init-time behavioral change only | respected | No migration code. Change is plugin-init-time only. No workflow state touched. |
| DONT1 | avoidance | **DONT1**: Do not delete or stub out worker-lock or worker-heartbeat modules | respected | worker-lock.ts and worker-heartbeat.ts untouched. No stubs or deletions. |
| DONT2 | avoidance | **DONT2**: Do not change the worker child process spawn mechanism (createMultiWorker / createOutOfProcessWorker) | respected | createMultiWorker and createOutOfProcessWorker not modified. |
| DONT3 | avoidance | **DONT3**: Do not introduce new feature flags — reuse the existing `worker_singleton_enforce` with flipped default | respected | Reused existing worker_singleton_enforce flag. No new flags introduced. |

