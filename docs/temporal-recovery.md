# Temporal Recovery Runbook

> **Status:** worker-model and recovery baseline. This runbook now outlives the retired cutover harness and remains the operator reference for worker-model decisions, failed-migration recovery, worker auto-respawn troubleshooting, `NonDeterministicWorkflowError` recovery, and disk-full / OOM surfaces.

## Worker model

### Decision (current — hybrid)

**The worker model is runtime-dependent**, selected automatically at plugin init:

| Plugin host                      | Worker model                                | Module                                         |
| -------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Node                             | In-process multi-queue Temporal worker      | `plugin/src/temporal/in-process-worker.ts`     |
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

## Failed migration recovery

Use this when a project's import ledger is not `done`.

1. Run `adv_status` and inspect:
   - `migration_status.status`
   - `migration_status.detail`
   - `temporal_health.server_alive`
   - `temporal_health.worker_process_alive`
2. Classify the failure:
   - `server_alive: false` → Temporal runtime/server problem first
   - `worker_process_alive: false` with `server_alive: true` → worker crash / restart exhaustion
   - `migration_status.status: failed` with detail → workflow reached a terminal failure state
   - `migration_status.status: empty|unknown|null` → no usable import ledger yet; treat as incomplete bootstrap / recovery state
3. Recover in order:
   - Restart the worker with `adv_temporal_worker_restart`
   - Re-check `adv_status`
   - If the worker is healthy but the project workflow state is still wrong, run `adv_workflow_repair` with explicit user approval evidence
4. Re-verify with `adv_status` until `migration_status.status` returns to `done`.

### Expected ledger meanings

| Ledger state | Meaning | Operator action |
| --- | --- | --- |
| `done` | Project import succeeded | No action |
| `failed` + detail | Workflow/import hit a terminal error | Fix root cause, then `adv_workflow_repair` |
| `empty` | Project workflow exists but has no import ledger entry | Restart worker, then re-check |
| `null` / missing | No reachable workflow state yet | Check server + worker health first |

## Worker auto-respawn troubleshooting

The Bun-host path uses one Node child per queue with restart backoff `1s -> 3s -> 10s` and a hard cap of 3 restart attempts.

### Signals to inspect

- `adv_status.temporal_health.server_alive`
- `adv_status.temporal_health.worker_alive`
- `adv_status.temporal_health.worker_process_alive`
- `adv_status.temporal_health.registered_queues`
- `adv_status.temporal_health.last_error`

### Common cases

| Health shape | Likely cause | Fix |
| --- | --- | --- |
| `server_alive=false` | Temporal dev server unreachable | Start / restore Temporal runtime first |
| `server_alive=true`, `worker_alive=true`, `worker_process_alive=false` | OOP child crashed and exhausted restart budget | Run `adv_temporal_worker_restart`; inspect `last_error` |
| `worker_alive=false` | No worker registered (degraded file-backed mode or init failure) | Check `ADV_DISABLE_TEMPORAL`, `ADV_ALLOW_DEGRADED_FALLBACK`, init logs |
| Bun host + init error about Node | Node binary not found | Install Node or set `ADV_NODE_PATH` |
| Error about worker bundle not found | Dist worker missing for OOP path | Run `pnpm run build:worker` in `plugin/` |

### OOP runtime hardening and tuning

The out-of-process worker has two bounded surfaces operators can observe and, in future releases, tune:

| Surface | Current default | What it controls |
| --- | --- | --- |
| Shutdown grace period | `5000` ms (`OOP_SHUTDOWN_GRACE_MS`) | Time between `SIGTERM` and escalating to `SIGKILL` during worker shutdown. A child that does not exit within this window is force-killed. |
| Readiness polling | Implicit via `canReachTemporalAddress(address, 250)` | Plugin-init probes the Temporal server before creating the worker. The 250 ms timeout prevents a hung server from blocking init. |

These values are compile-time constants today. If you need to adjust them for a specific host (e.g. slower disks or overloaded CI runners), open an issue — the next likely step is env-based overrides (`ADV_OOP_SHUTDOWN_GRACE_MS`, `ADV_TEMPORAL_PROBE_TIMEOUT_MS`).

## `NonDeterministicWorkflowError` recovery

Treat this as a workflow-state corruption / code-history mismatch problem, not a transient retry.

1. Confirm the error in logs or `last_error`.
2. Do **not** keep restarting the same worker hoping it clears.
3. Get explicit user approval.
4. Run `adv_workflow_repair` for the affected change.
5. Re-run `adv_status` and confirm the project/change workflow is healthy again.

`adv_workflow_repair` is the supported operator path because it:
- terminates the broken project workflow,
- rebuilds workflow state from the legacy snapshot,
- re-imports the requested change,
- re-emits derived agenda/wisdom exports.

## Stale `adv/change/*` and `adv/project/*` workflows

Orphaned workflows occur when a bulk enqueue creates `adv/change/*` or `adv/project/*` executions on a task queue that has **no live poller**. The first workflow task is scheduled but never dispatched, so the execution remains in `Running` state indefinitely.

### Symptoms

- `adv_agenda_add` (and other tools that route through the project workflow) fails with `Temporal worker not ready for queue advance-{projectId}` in repos that never started a local worker.
- `temporal workflow list` shows thousands of `Running` workflows with only 2 history events (`WorkflowExecutionStarted`, `WorkflowTaskScheduled`).
- `temporal task-queue describe --task-queue advance-{projectId}` shows an empty poller list.

### Detection

```bash
# Count all Running workflows
temporal workflow count --query 'ExecutionStatus="Running"'

# Count Running workflows for a specific queue
temporal workflow count \
  --query 'ExecutionStatus="Running" AND TaskQueue="advance-{projectId}"'

# Check for pollers (empty list means orphaned)
temporal task-queue describe --task-queue advance-{projectId}
```

### Safe batch-termination

> **⚠️ Update the date.** Replace `YYYY-MM-DD` below with the day **before** the incident enqueue date so you do not terminate legitimate in-flight work.

```bash
# Terminate orphaned change workflows
temporal workflow terminate \
  --query 'ExecutionStatus="Running" AND WorkflowType="changeWorkflow" AND StartTime < "YYYY-MM-DDT00:00:00Z"' \
  --reason "Orphaned workflow cleanup — no poller for queue"

# Terminate orphaned project workflows
temporal workflow terminate \
  --query 'ExecutionStatus="Running" AND WorkflowType="projectWorkflow" AND StartTime < "YYYY-MM-DDT00:00:00Z"' \
  --reason "Orphaned workflow cleanup — no poller for queue"
```

Verify after termination:

```bash
temporal workflow count --query 'ExecutionStatus="Running"'
# Should show only expected active workflows (none if cleanup was complete).
```

### Lineage

- **`bb2d901`** (2026-04-20) — introduced the dogfood migration tool `plugin/scripts/dogfood-migration.ts`, which bulk-enqueued `changeWorkflow` executions on per-project queues without ensuring a poller for every queue.
- **`24bf177`** (2026-04-22) — deleted the migration infrastructure, including the limited termination script `adv-migration-terminate.ts`. The deletion left already-enqueued workflows orphaned.
- **2026-04-23 incident** — 5,447 `Running` workflows discovered across 21 queues with zero pollers, blocking `adv_*` tools in affected repos.
- **`preventRecoverOrphanedTemporal`** (this change) — added this runbook section, a prevention policy, and an `adv_status` guardrail that surfaces stale queues automatically.

## Disk-full / OOM surfaces

These usually appear as secondary symptoms:
- worker exits with restart loops,
- `worker_process_alive=false`,
- Temporal connection/write failures,
- missing or stale derived exports after an otherwise healthy command path.

### Disk-full checklist

- Confirm free space on the host
- Check the plugin's external state directory and runtime/cache locations
- Re-run the blocked command only after space is restored
- If workflow state and derived exports diverged, use `adv_workflow_repair`

### OOM checklist

- Look for repeated worker child exits or abrupt process termination
- Prefer restarting the worker before re-running larger operations
- If the same queue repeatedly dies under load, revisit the worker-model alternatives above (shard or external fleet)

## Cutover cleanup status

The temporary bootstrap migration harness used during cutover has already been retired after dogfood completion. The historical worker-model discussion remains here, but the transitional artifacts (`migrate-runner`, `migration-workflow`, dogfood scripts, and the generated dogfood report) are no longer part of the shipping codebase.

## Background and references

### 2026-04-21 Bun crash-loop incident

The hybrid worker model exists because earlier wiring of the Temporal swap into the plugin bootstrap caused every opencode session to crash-loop with a wall of warn/error spam. Captured here so the cause + fix are discoverable from the doc tree, not only from ADV-state wisdom.

- **Symptom:** every opencode session emitted `[plugin-init] (warn) Plugin init failed: Webpack finished with errors ...` plus continuous `temporalio_client` retry errors. Sessions became unusable; `adv_*` tools returned `ADV_PLUGIN_INIT_FAILED` stubs.
- **Root cause:** opencode ships as a compiled Bun 1.3.8 binary. `@temporalio/worker.Worker.create()` internally spawns a Workflow Worker Thread whose `require('@temporalio/common')` fails from Bun's install-cache path. The "Webpack finished with errors" message is misleading boilerplate — webpack itself succeeds. Upstream: [temporalio/sdk-typescript#1334](https://github.com/temporalio/sdk-typescript/issues/1334), [oven-sh/bun#27058](https://github.com/oven-sh/bun/issues/27058), [oven-sh/bun#27464](https://github.com/oven-sh/bun/issues/27464).
- **Triggered by:** `replaceAdvStorageLayerTemporal` scaffold landing + `migrateAdvStateTemporalRetire` Phase A wiring Temporal into plugin bootstrap.
- **Immediate workaround (still in place on some hosts):** `export ADV_DISABLE_TEMPORAL=1` in `~/.zshenv`. Routes the plugin through the file-backed harness. Must be unset before resuming the Temporal cutover (see `migrateAdvStateTemporalRetire` resume preconditions).
- **Permanent fix:** shipped in `fixTemporalWorkerBundleFailure` (archived 2026-04-21). The hybrid worker model documented above (Node host → in-process; Bun host → out-of-process Node child via `createOutOfProcessWorker`) is the structural answer. Phase 1 also narrowed the `logger.warn` → `logger.info` for the Temporal-init failure path so it stops reaching the console, added `ADV_ALLOW_DEGRADED_FALLBACK=1` opt-in, and added a fast `canReachTemporalAddress()` short-circuit so `adv_status` no longer hangs ~5s when the server is offline. Phase 3 hardened workflow determinism (`gate-reentry.ts` accepts an explicit `now`) and added the `withTestWorkflowEnvironment` helper to prevent `/tmp/temporal-test-server-*` zombie-proc leaks.

### Cross-references

| Where                                                                           | Pointer                                                                                                  |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Public bug                                                                      | [Sharper-Flow/Advance#5](https://github.com/Sharper-Flow/Advance/issues/5)                               |
| Trunk merge commit                                                              | `e8e332c` (`Merge branch 'change/fixTemporalWorkerBundleFailure' into trunk`)                            |
| Archive                                                                         | `~/.local/share/opencode/plugins/advance/<projectId>/archive/2026-04-21-fixTemporalWorkerBundleFailure/` |
| Project-level wisdom — root cause                                               | `pw-MfGaoxPY` (gotcha)                                                                                   |
| Project-level wisdom — fix record                                               | `pw-jcccyH8a` (success)                                                                                  |
| Project-level wisdom — resume preconditions for `migrateAdvStateTemporalRetire` | `pw-FPJlvon7` (pattern)                                                                                  |
| Related earlier wisdom (worker-thread per-project queue routing)                | `ws-lRl054` on `migrateAdvStateTemporalRetire` (now structurally resolved)                               |
