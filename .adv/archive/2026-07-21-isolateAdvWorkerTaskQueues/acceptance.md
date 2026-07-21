# Acceptance

Reviewed at: 2026-07-21T12:25:00Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | **SC1**: Multiple ADV agents on the same project (2-5 concurrent sessions) no longer wedge each other under typical multi-session load. | pass | wedge-isolation.itest.ts |
| SC2 | success_criterion | **SC2**: One session's worker degradation does not block other sessions' ADV state queries (signals/queries processed within bounded latency). | pass | wedge-isolation.itest.ts query answering |
| SC3 | success_criterion | **SC3**: No manual `adv_temporal_worker_restart` needed under concurrent load (regression vs today's manual recovery). | pass | plugin-init.ts auto workerQueues |
| SC4 | success_criterion | **SC4**: Total per-project Temporal polling load decreases (not increases) under multi-session load vs current state. | pass | caps 70% reduction |
| SC5 | success_criterion | **SC5**: Existing single-session workflows continue working unchanged (no regression for single-session users). | pass | backward-compat tests pass |
| AC1 | acceptance_criterion | **AC1**: When session S1 on project P starts a change workflow, the workflow's task queue is `advance-{P}-{S1}` (verified via Temporal workflow describe or task-queue inspection). | pass | session-routing.itest.ts tr_mru6n4sm_e6446c02 |
| AC2 | acceptance_criterion | **AC2**: When session S1 is wedged (worker process alive but not polling) and session S2 is active, S2's workflow signals on `advance-{P}-{S2}` are still processed within bounded latency. | pass | wedge-isolation.itest.ts tr_mru6y91e_be81a825 |
| AC3 | acceptance_criterion | **AC3**: When an in-flight workflow exists on legacy `advance-{P}` queue at the moment of routing change, signals to it are still processed (legacy queue co-polling works). | pass | legacy-copoll.itest.ts tr_mru6qc7a_e5b40fdb |
| AC4 | acceptance_criterion | **AC4**: Every `Worker.create` call site in `plugin/src/temporal/` passes explicit tuning options bounding poller count, workflow slot count, activity slot count, and activity rate per the design-phase decision. | pass | drift guard tr_mru6axdp_2537c972 |
| AC5 | acceptance_criterion | **AC5**: Epic workflows route to `advance-{P}` (project queue), not a session queue. | pass | session-routing.itest.ts epic |
| AC6 | acceptance_criterion | **AC6**: `adv_temporal_diagnose` and `health-probe` output distinguishes session-queue serviceability from project-queue serviceability and identifies the owning session for each session-queue. | pass | temporal-ops + status-health tests tr_mru7v1sp_d3e6382b |
| AC7 | acceptance_criterion | **AC7**: Total per-project poller count under 3 concurrent sessions does not exceed the cap-bounded target (≤18 = 3 sessions × 3 queues × 2 pollers). | pass | poller-footprint.itest.ts tr_mru6y91e_be81a825 |
| AC8 | acceptance_criterion | **AC8**: Session end (worker death via AC4 watchdog) leaves no orphan polling process; the session's workflows on `advance-{P}-{sess}` drain naturally as they complete/archive. | pass | no-orphan-poller.itest.ts tr_mru6y91e_be81a825 |
| C1 | constraint | OpenCode plugin SDK version 1.18.4 (must work on current SDK). | respected | typecheck tr_mru7r4aq_5de0a36f |
| C2 | constraint | No new infrastructure — works on existing Temporal dev server. | respected | no new infra |
| C3 | constraint | Preserve `reapOrphanAdvWorkers` / `autoRollStaleWorkerBundle` / AC4 parent-liveness watchdog behavior (extend, not replace). | respected | watchdog unchanged |
| C4 | constraint | `adv_temporal_diagnose` must continue to detect wedge accurately under new model. | respected | diagnose extended |
| C5 | constraint | Total per-project poller load must not exceed current levels. | respected | caps bound to 18 |
| C6 | constraint | Must not break single-session workflows. | respected | single-session unchanged |
| C7 | constraint | Must not require operator intervention for routine session start/stop. | respected | auto computation |
| C8 | constraint | Must not consume unbounded resources (per-session queues drain on session end via AC4 watchdog). | respected | no orphan; KD-4 drain |
| C9 | constraint | Session ID source for queue suffix is the canonical `sess_<8 alphanumeric>` from `plugin/src/utils/session-id.ts` (already used by `adv_session_list` and `adv_status`). | respected | sess_<8 alphanumeric> |
| DONT1 | avoidance | Do NOT move epic workflows to a session queue — would couple project-scoped entity lifetime to a single session. | respected | epic on project queue |
| DONT2 | avoidance | Do NOT introduce a one-shot re-drive tool for migration — Temporal staff explicitly state task-queue migration is unsupported for preserved state. | respected | no re-drive tool |
| DONT3 | avoidance | Do NOT add Client-side RPC admission limiting (signal/start/query volume bounded by agent turn cadence — not the observed wedge mechanism). | respected | no RPC limiting |
| DONT4 | avoidance | Do NOT tune the Temporal dev server via dynamic config — out of scope per Constraints (no new infrastructure). | respected | no dynamic config |
| DONT5 | avoidance | Do NOT increase total per-project polling load vs current state — caps are required to keep total bounded. | respected | caps reduce load |
| DONT6 | avoidance | Do NOT collide with concurrent `slimMutationToolSurface`, `addAdvMcpReadSurface`, `replaceRecoveryToolSprawl`, `tightenToolOutputDefaults`, `tightenAdvChatVoice` work (different surface: `plugin/src/temporal/*`, not `tool-role-policy.ts` / `tool-registry.ts`). | respected | scoped surface |
| OOS1 | out_of_scope | Cross-project task-queue concerns (project ID already isolates projects). | missing |  |
| OOS2 | out_of_scope | Temporal Worker Versioning (separate concern; covered by `bl-F5_tYP9R`). | missing |  |
| OOS3 | out_of_scope | Recovering wedged workflows from prior shared-queue history (one-time cleanup, separate concern). | missing |  |
| OOS4 | out_of_scope | Server-side Temporal tuning (dev server dynamic config; production deployments). | missing |  |
| OOS5 | out_of_scope | Client-side RPC admission limiting in STSL (separate concern; ADV RPC cadence bounded by agent turn cycle). | missing |  |

