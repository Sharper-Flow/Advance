# Temporal Recovery Runbook

> **Status:** stub. This runbook is started by task A4e (`migrateAdvStateTemporalRetire`) to capture the worker-model decision while it is still fresh. Task C8 will expand the file into a full operator runbook covering failed-migration recovery, worker auto-respawn troubleshooting, `NonDeterministicWorkflowError` recovery, disk-full / OOM surfaces, and the eventual `migrateAllProjectsWorkflow` cleanup.

## Worker model

### Decision (current — hybrid)

**The worker model is runtime-dependent**, selected automatically at plugin init:

| Plugin host | Worker model | Module |
| --- | --- | --- |
| Node | In-process multi-queue Temporal worker | `plugin/src/temporal/in-process-worker.ts` |
| Bun (opencode's shipping binary) | Out-of-process Node child process per queue | `plugin/src/temporal/out-of-process-worker.ts` |

The hybrid was activated by `fixTemporalWorkerBundleFailure` after reproduction confirmed `@temporalio/worker.Worker.create()` cannot run in-process under Bun: the SDK spawns a Node worker thread whose `require('@temporalio/common')` fails from Bun's install-cache path ([upstream issue #1334](https://github.com/temporalio/sdk-typescript/issues/1334)). Alternative direction #1 below is now the active model for the Bun path.

### In-process path (Node hosts)

The plugin bootstrap (`plugin/src/plugin-init.ts`) calls `createInProcessWorker` (`plugin/src/temporal/in-process-worker.ts`) to create a single worker that lives inside the plugin's Node process. The worker owns one `NativeConnection` and one `@temporalio/worker` `Worker` instance per task queue (the Temporal SDK requires a `Worker` per queue; they share the underlying connection so the cost stays bounded).

Queues registered up front:

- `advance-{projectId}` for the controlling project

New queues can be registered at runtime via `InProcessWorker.registerQueue(taskQueue)` — useful for the bootstrap migration sweep, which may discover additional project queues as it iterates.

### Why this shape

- **Lifecycle is simple.** `worker.shutdown()` + `connection.close()` drain gracefully. No detached child-process cleanup, no SIGTERM bookkeeping, no stale-bundle hazards across boots.
- **One process to reason about.** `adv_status` can surface worker health directly; no separate pid tree to correlate.
- **Tests can inject a connection.** `createInProcessWorker` accepts an injected `NativeConnection`, which means integration tests can share a `TestWorkflowEnvironment` client without spinning up an external dev server.
- **Nothing agent-shaped about the worker.** The worker is only a code-runner for Temporal task queues — it does not make decisions, spawn sub-agents, or maintain intent. ADV's agent layer runs separately.

### Out-of-process path (Bun hosts — ACTIVATED)

When `probeTemporalWorkerRuntime()` reports Bun (or any unsupported worker runtime), plugin-init spawns one detached Node child process per task queue via `createOutOfProcessWorker`. Each child runs `plugin/src/temporal/worker.ts` (`runTemporalWorkerFromEnv`), reading its task queue + address + namespace from env. Stdout/stderr is routed to the file-sink logger only — never to console — to avoid session spam.

Node binary discovery: `resolveNodeExecutable()` checks `ADV_NODE_PATH` first, then walks `PATH`. If no Node is found, plugin init throws a remediation error suggesting `nvm`/Homebrew install + `ADV_NODE_PATH`. Users can opt into file-backed fallback with `ADV_ALLOW_DEGRADED_FALLBACK=1`.

Restart policy: on non-zero child exit, `createOutOfProcessWorker` schedules respawn with exponential backoff (1s → 3s → 10s). Maximum 3 attempts per queue. After exhaustion, the queue is marked dead and surfaced via `adv_status` → `worker_process_alive: false`. No automatic fallback to file-backed — that's an init-time decision.

Shutdown: `drainInProcessTemporalWorkers` (legacy name, both worker kinds share the registry) sends SIGTERM to each child and awaits the `exit` event before resolving. The Phase 2.5 implementation skips the hard-deadline SIGKILL; follow-up work may tighten that window if tests show slow drains blocking session teardown.

### Alternative directions (future consideration)

These alternatives were evaluated and deliberately deferred. Revisit if the linked conditions materialise.

1. **One detached worker process per project queue** — **ACTIVATED** for Bun hosts as of `fixTemporalWorkerBundleFailure`. Trigger: Bun cannot run the worker in-process; see the out-of-process section above for the shipping design. The original trade-offs (child-process cleanup complexity, stale-bundle hazards) are mitigated by (a) SIGTERM-then-await on shutdown, (b) detached=false so OS kills the child if the parent dies unexpectedly, (c) exponential-backoff restart with a hard cap on attempts.
2. **One worker per logical shard** — if the project count grows beyond what a single polling loop can service (hundreds), shard queues by hash and run M workers (where M ≪ N). Keeps the lifecycle simple but adds a shard-assignment concern. Revisit if a single in-process worker's task-poller starts starving.
3. **Dedicated worker fleet managed outside the plugin process** — push the worker tier out of the plugin entirely into an always-on service. Only makes sense if ADV operators need long-running workflows to survive plugin restarts with zero startup cost. Not relevant while ADV remains a per-session plugin.

### How to revisit

- **Trigger for alt #1 (isolation):** a runaway activity on one project queue regularly blocks others, or worker OOM takes down unrelated projects' workflows.
- **Trigger for alt #2 (sharding):** `adv_status` shows per-queue poll latency climbing while a single worker is healthy.
- **Trigger for alt #3 (external fleet):** plugin-restart-driven downtime on long-running workflows becomes user-visible.

Until one of those triggers fires, keep the single in-process worker. Adding processes, shards, or services before they're needed pays the operational cost without the benefit.
