# Per-Session Task-Queue Routing for ADV Worker Isolation

We adopted per-session task-queue routing (`advance-{projectId}-{sessionId}`) for change workflows, retained the permanent project queue (`advance-{projectId}`) for Epic workflows and legacy migration co-polling, capped every `Worker.create` via a shared `getAdvWorkerTuningOptions()` module, and flipped the `worker_singleton_enforce` default to `false` so every session spawns its own worker. Singleton mode remains available as an explicit compatibility option (`worker_singleton_enforce: true`): it reactivates the project-scoped worker lock and client-only peers, but is refused while session-pinned workflows are still active. This isolates cross-session dispatch: a wedged worker in session S1 cannot block workflow signals for session S2 because S2's workflows route to S2's own session queue, polled by S2's own worker process. The ten-agent support target is based on historical/current operational evidence (12 overlapping total agents, 6 orchestrators) and the existing host budget, not on a synthetic latency benchmark.

**Status:** proposed (advisory — gate completion for `isolateAdvWorkerTaskQueues` does not depend on ADR merge)

**Context:** Observed wedge (2026-07-21): N concurrent OpenCode sessions on the same ADV-enabled project shared a single Temporal task queue (`advance-{projectId}`). When one session's worker wedged (process alive but not polling), every session's workflow signals stalled because all change workflows routed to the shared queue. The shared-queue model optimized poller count at the cost of cross-session failure isolation; under multi-session development that tradeoff inverts.

**Considered options:**

- Per-session task-queue routing with Worker.create caps + flipped singleton default — selected. Canonical Temporal multi-tenant isolation pattern (sourced via adv-researcher evidence). Caps bound per-session polling footprint (1+1 pollers, 4 slots per queue; total ≤18 pollers under 3 concurrent sessions vs. 180 uncapped). Project queue remains permanent for Epics + legacy co-polling (KD-4 implicit migration).
- Per-session worker pool on shared project queue — rejected. Multiple workers polling one queue still serialize on whichever task the server happens to dispatch; does not isolate dispatch, only spreads load. The wedge symptom would persist.
- Visibility-based dynamic drain detection (originally proposed in v1 design) — rejected. Self-contradictory with permanent project-queue polling (Epics live there); search-attribute predicate was unverified. Project queue is now polled permanently; migration is implicit through workflow archival.
- Auto-disable `worker_singleton_enforce` when per-session routing is active (implicit override) — rejected. Adds hidden coupling between two feature flags; the explicit default flip is simpler and one-shaped.

**Consequences:**

- (+) Cross-session dispatch isolation — peer-session wedge cannot block signals (AC1, AC2).
- (+) Total per-project polling load decreases ~70% under 3-session load (caps enforce 6 pollers per session vs. uncapped SDK defaults of 20+).
- (+) Migration is implicit — no dynamic drain detection needed; legacy change workflows on the project queue complete and archive naturally (AC3).
- (+) AC1/AC2 achievable: every session has its own worker polling its own session queue.
- (−) Worker process count rises from 1/project to 1/session (memory cost; bounded by session count, typically ≤3).
- (−) One additional queue per session (drains naturally on session end via parent-liveness watchdog — AC8).
- (−) Users who explicitly set `worker_singleton_enforce: true` get incorrect behavior under per-session routing (only host session's queue is polled); documented as incompatible.
- (+) Conditional singleton mode: explicit `worker_singleton_enforce: true` is supported as a compatibility opt-in, but activation is refused while session-pinned workflows remain active.
- (+) Evidence-based support target: ten overlapping agents is a demand/observation boundary derived from historical/current session composition (12 total, 6 orchestrators), queue failure results, and worker memory, not a measured synthetic latency claim.

**Conditional singleton mode:**

When `worker_singleton_enforce` is omitted or explicitly `false`, the default per-session routing applies: each OpenCode session spawns its own worker, change workflows route to `advance-{projectId}-{sessionId}`, and there is no client-only peer requirement. When `worker_singleton_enforce` is explicitly `true`, the project-scoped worker lock from `rq-workerSingleton01` is active, one worker per project polls the project queue, and peer sessions participate as Temporal clients. Activating singleton mode while session-pinned change workflows are still open would strand those histories, so the implementation must detect active session queues and refuse the switch with an `INCOMPATIBLE_ACTIVE_SESSION_QUEUES` diagnostic.

**Rubric check (hard-to-reverse / surprising-without-context / result-of-real-tradeoff):**

- Hard-to-reverse: YES — workflows pin to their start queue for their lifetime.
- Surprising-without-context: YES — per-session routing is non-obvious without the wedge evidence.
- Result-of-real-tradeoff: YES — dispatch isolation vs. polling-load + worker-count, resolved by caps + default flip.

**Related design:** `isolateAdvWorkerTaskQueues` change (KD-1 through KD-10).

**Related prior ADR:** ADR-0004 (per-Epic workflow) — Epics stay on the permanent project queue, which is why this ADR requires retaining `advance-{projectId}` rather than replacing it.
