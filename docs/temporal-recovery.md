# Temporal Recovery Runbook

> **Status:** stub. This runbook is started by task A4e (`migrateAdvStateTemporalRetire`) to capture the worker-model decision while it is still fresh. Task C8 will expand the file into a full operator runbook covering failed-migration recovery, worker auto-respawn troubleshooting, `NonDeterministicWorkflowError` recovery, disk-full / OOM surfaces, and the eventual `migrateAllProjectsWorkflow` cleanup.

## Worker model

### Decision (current)

**One in-process multi-queue Temporal worker per plugin boot.**

The plugin bootstrap (`plugin/src/plugin-init.ts`) calls `createInProcessWorker` (`plugin/src/temporal/in-process-worker.ts`) to create a single worker that lives inside the plugin's Node process. The worker owns one `NativeConnection` and one `@temporalio/worker` `Worker` instance per task queue (the Temporal SDK requires a `Worker` per queue; they share the underlying connection so the cost stays bounded).

Queues registered up front:

- `advance-{projectId}` for the controlling project

New queues can be registered at runtime via `InProcessWorker.registerQueue(taskQueue)` — useful for the bootstrap migration sweep, which may discover additional project queues as it iterates.

### Why this shape

- **Lifecycle is simple.** `worker.shutdown()` + `connection.close()` drain gracefully. No detached child-process cleanup, no SIGTERM bookkeeping, no stale-bundle hazards across boots.
- **One process to reason about.** `adv_status` can surface worker health directly; no separate pid tree to correlate.
- **Tests can inject a connection.** `createInProcessWorker` accepts an injected `NativeConnection`, which means integration tests can share a `TestWorkflowEnvironment` client without spinning up an external dev server.
- **Nothing agent-shaped about the worker.** The worker is only a code-runner for Temporal task queues — it does not make decisions, spawn sub-agents, or maintain intent. ADV's agent layer runs separately.

### Alternative directions (future consideration)

These alternatives were evaluated and deliberately deferred. Revisit if the linked conditions materialise.

1. **One detached worker process per project queue** — the original spawn+detach design (`spawnTemporalWorkerProcess` + `worker.ts` entrypoint in the scaffold). Useful if per-project workload isolation or memory pressure ever forces per-process fault boundaries. Trade-offs: N child processes per project, cleanup-on-shutdown complexity, stale-bundle hazards if a prior boot's worker outlives the plugin.
2. **One worker per logical shard** — if the project count grows beyond what a single polling loop can service (hundreds), shard queues by hash and run M workers (where M ≪ N). Keeps the lifecycle simple but adds a shard-assignment concern. Revisit if a single in-process worker's task-poller starts starving.
3. **Dedicated worker fleet managed outside the plugin process** — push the worker tier out of the plugin entirely into an always-on service. Only makes sense if ADV operators need long-running workflows to survive plugin restarts with zero startup cost. Not relevant while ADV remains a per-session plugin.

### How to revisit

- **Trigger for alt #1 (isolation):** a runaway activity on one project queue regularly blocks others, or worker OOM takes down unrelated projects' workflows.
- **Trigger for alt #2 (sharding):** `adv_status` shows per-queue poll latency climbing while a single worker is healthy.
- **Trigger for alt #3 (external fleet):** plugin-restart-driven downtime on long-running workflows becomes user-visible.

Until one of those triggers fires, keep the single in-process worker. Adding processes, shards, or services before they're needed pays the operational cost without the benefit.
