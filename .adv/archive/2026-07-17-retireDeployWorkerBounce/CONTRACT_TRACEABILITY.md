# Contract Traceability

**Change ID:** retireDeployWorkerBounce
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-17T02:51:09.338Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Marked current-generation worker left unsignaled by mutating deploy, exit 0 with advisory (deploy-local-worker-refresh fixture tests; reviewer-verified 114 targeted tests pass). |
| SC2 | success_criterion | pass | review | Legacy loud semantics verified in tests AND live 2026-07-17T02:48Z: branch deploy classified pre-marker running workers as legacy, applied SIGTERM+grace, emitted [ADV:ACTION_REQUIRED] with PIDs and exited 1 for survivors. |
| SC3 | success_criterion | pass | review | Live post-restart convergence: deployed manifest built_at 02:48:58Z generation c929e329887d…; worker restarted 02:49:49Z; worker.lock bundle_generation equalled deployed generation with last_heartbeat 02:49:57Z — within 60s. |
| AC1 | acceptance_criterion | pass | test | Fixture with ADV_TEMPORAL_WORKER_SELF_ROLL=1 left running; deploy exits 0 with advisory, no [ADV:ACTION_REQUIRED] (deploy-local-worker-refresh.test.ts, reviewer-verified). |
| AC2 | acceptance_criterion | pass | test | Missing/malformed/unreadable capability evidence classified legacy; SIGTERM-resistant fixture yields exit 1 + [ADV:ACTION_REQUIRED] with PID and recovery instruction (tests) — behavior also observed live on 02:48Z deploy. |
| AC3 | acceptance_criterion | pass | test | --check and --dry-run send no signals to marked or legacy fixtures; reviewer added dry-run marked-worker no-signal regression coverage during acceptance review. |
| AC4 | acceptance_criterion | pass | test | Exact-path matching does not signal unrelated Node/Bun processes (fixture tests, reviewer-verified 114 targeted pass). |
| AC5 | acceptance_criterion | pass | test | LIVE PROOF 2026-07-17 (user-approved option b): deployed dist/temporal/bundle-manifest.json generation c929e329887da70c… built_at 02:48:58Z; adv_temporal_worker_restart 02:49:49Z returned serviceable replacement (PID 1429384, fresh pollers); worker.lock schema v2 bundle_generation matched deployed generation at last_heartbeat 02:49:57Z — ready replacement + lock generation equality well within 60s. |
| AC6 | acceptance_criterion | pass | test | Marked-worker deployment leaves crash-respawn accounting unchanged (lifecycle tests); live restart diagnostics show restartCount 0. |
| AC7 | acceptance_criterion | pass | test | Spec (advance-meta), generated docs, setup/archive/recovery guidance, implementation, and tests all describe marker-gated self-roll with legacy fallback (task 3 checkpoint evidence + reviewer corpus verification). |
| C1 | constraint | respected | static_check | Classifier fails closed; capability proven only by literal running-process marker, never by on-disk manifest (contract tests pin marker literal; pnpm run check green). |
| C2 | constraint | respected | static_check | Exact-path process discovery preserved; AC4 tests prove no broadened matching. |
| C3 | constraint | respected | static_check | Legacy transition behavior maintained until explicit marker — demonstrated live: pre-marker workers handled through legacy path on first rollout. |
| DONT1 | avoidance | respected | review | Worker refresh protection retained for legacy/unclassifiable workers; only proven self-roll workers exempted. |
| DONT2 | avoidance | respected | review | Manifest presence/timestamps never used as capability proof (DC1; reviewer static review). |
| DONT3 | avoidance | respected | review | Normal marked-worker deployment does not consume crash-respawn budget (planned-roll accounting tests; live restartCount 0). |
| OOS1 | out_of_scope | not_applicable | not_applicable | Cross-shard worker/lock discovery unchanged. |
| OOS2 | out_of_scope | not_applicable | not_applicable | In-process worker lifecycle behavior unchanged. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-44e886b3079d | AC1, AC5, AC6 |  | C1, C3, DONT3 |  |
| tk-2abd23933165 | AC1, AC2, AC3, AC4 |  | C1, C2, C3, DONT1, DONT2 |  |
| tk-5834ec43a767 |  | AC7 | C1, DONT1, DONT2 |  |
