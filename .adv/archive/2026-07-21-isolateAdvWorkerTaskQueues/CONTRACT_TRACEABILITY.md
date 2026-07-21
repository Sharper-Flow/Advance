# Contract Traceability

**Change ID:** isolateAdvWorkerTaskQueues
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-21T12:25:00Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | wedge-isolation.itest.ts |
| SC2 | success_criterion | pass | review | wedge-isolation.itest.ts query answering |
| SC3 | success_criterion | pass | review | plugin-init.ts auto workerQueues |
| SC4 | success_criterion | pass | review | caps 70% reduction |
| SC5 | success_criterion | pass | review | backward-compat tests pass |
| AC1 | acceptance_criterion | pass | test | session-routing.itest.ts tr_mru6n4sm_e6446c02 |
| AC2 | acceptance_criterion | pass | test | wedge-isolation.itest.ts tr_mru6y91e_be81a825 |
| AC3 | acceptance_criterion | pass | test | legacy-copoll.itest.ts tr_mru6qc7a_e5b40fdb |
| AC4 | acceptance_criterion | pass | test | drift guard tr_mru6axdp_2537c972 |
| AC5 | acceptance_criterion | pass | test | session-routing.itest.ts epic |
| AC6 | acceptance_criterion | pass | test | temporal-ops + status-health tests tr_mru7v1sp_d3e6382b |
| AC7 | acceptance_criterion | pass | test | poller-footprint.itest.ts tr_mru6y91e_be81a825 |
| AC8 | acceptance_criterion | pass | test | no-orphan-poller.itest.ts tr_mru6y91e_be81a825 |
| C1 | constraint | respected | static_check | typecheck tr_mru7r4aq_5de0a36f |
| C2 | constraint | respected | static_check | no new infra |
| C3 | constraint | respected | static_check | watchdog unchanged |
| C4 | constraint | respected | static_check | diagnose extended |
| C5 | constraint | respected | static_check | caps bound to 18 |
| C6 | constraint | respected | static_check | single-session unchanged |
| C7 | constraint | respected | static_check | auto computation |
| C8 | constraint | respected | static_check | no orphan; KD-4 drain |
| C9 | constraint | respected | static_check | sess_<8 alphanumeric> |
| DONT1 | avoidance | respected | review | epic on project queue |
| DONT2 | avoidance | respected | review | no re-drive tool |
| DONT3 | avoidance | respected | review | no RPC limiting |
| DONT4 | avoidance | respected | review | no dynamic config |
| DONT5 | avoidance | respected | review | caps reduce load |
| DONT6 | avoidance | respected | review | scoped surface |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-bcec2249b320 | AC4 |  | C5 |  |
| tk-7dc4e04c085b | AC1, AC5 |  | C2, C9 |  |
| tk-d96902977df3 | AC4, AC7 |  | C5 |  |
| tk-0658984534a2 | AC1 |  | C9 |  |
| tk-362bb4f07f29 | AC1 |  | C9 |  |
| tk-c96013c1a6a8 | AC1, AC2 |  | C6, C7, DONT5 |  |
| tk-654199bec3cb | AC1, AC5 |  | DONT1 |  |
| tk-e144b115d1cc | AC1, AC2 |  | C3, C8 |  |
| tk-a75260d89d81 | AC6 |  | C4 |  |
| tk-bbe046a7783b | AC6 |  | C4 |  |
| tk-8e66d25d20b9 |  | AC2, SC1, SC2 |  |  |
| tk-55f24cb94237 |  | AC3 |  |  |
| tk-d9cf8fbf5fef |  | AC8 |  |  |
| tk-fa6409b3af2c |  | AC7, SC4 |  |  |
| tk-f8446ebd85e7 |  | AC1, AC5 |  |  |
| tk-57fdd4b32814 | AC1, AC2, AC3, AC6 |  | C3, C4 |  |
| tk-9c56529b5b23 |  |  | C3, C7 |  |
