# Temporal Recovery Runbook

> **Status:** worker-model and recovery baseline. This runbook now outlives the retired cutover harness and remains the operator reference for post-crash diagnosis, worker-model decisions, failed-migration recovery, worker auto-respawn troubleshooting, `NonDeterministicWorkflowError` recovery, orphan cleanup, and disk-full / OOM surfaces.

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

Node binary discovery: `resolveNodeExecutable()` checks `ADV_NODE_PATH` first, then walks `PATH`. If no Node is found, plugin init throws a remediation error suggesting `nvm`/Homebrew install + `ADV_NODE_PATH`. There is no runtime fallback to the file-backed backend.

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

## Post-crash recovery entry point

Use this first when agents report Temporal errors after an OpenCode or host
crash, especially:

- `Temporal re-seed failed for change ...`
- `WorkflowNotFoundError` for an `adv/change/*` workflow
- `ServiceError: Failed to start Workflow`
- worker respawn-loop messages
- startup warnings that mention plugin or Temporal initialization

### Step 1 — Diagnose, do not loop retries

Run the read-only classifier first:

```bash
adv_temporal_diagnose
```

If a specific change is failing, include it:

```bash
adv_temporal_diagnose changeId: "<change-id>"
```

The diagnostic output reports:

- Temporal server reachability
- STSL initialization and reconnect counters
- worker / worker-process health
- project workflow reachability
- optional change workflow reachability
- required ADV search-attribute status
- stale queues
- last Temporal error
- recommended next action

Agents should emit one concise diagnostic and follow the recommended next
action. Do **not** keep cycling through `adv_status`, worker restart, and
workflow repair when the same diagnostic remains unchanged.

### Agent anti-spam rule

When Temporal recovery is noisy, agents should report state changes, not every
retry attempt.

Emit once:

- first diagnostic summary
- chosen recovery action
- approval boundary, when mutation is required
- final recovered/blocked state

Suppress repeats:

- identical `adv_status` snapshots
- identical `adv_temporal_diagnose` recommendations
- repeated worker restart attempts with the same `last_error`
- generic “trying again” progress messages without new evidence

Escalate instead of repeating after the same recovery action fails three times.
Include the diagnostic snapshot, attempted actions, and exact last error.

### Missing required ADV search attributes

ADV change workflows start with custom Temporal search attributes:

| Attribute           | Type      |
| ------------------- | --------- |
| `AdvProjectId`      | `Keyword` |
| `AdvChangeId`       | `Keyword` |
| `AdvChangeStatus`   | `Keyword` |
| `AdvActiveGate`     | `Keyword` |
| `AdvDoomLoopActive` | `Bool`    |

If these attributes are missing, project workflows may still run while change
workflow starts fail with generic errors such as:

```text
ServiceError: Failed to start Workflow
```

Recovery:

1. Run `adv_temporal_diagnose` and confirm `searchAttributes.ok=false`.
2. Get explicit user approval.
3. Run `adv_temporal_register_search_attributes` with approval evidence.
4. Re-run `adv_temporal_diagnose` or the blocked ADV command.

The registration tool creates missing attributes only. It refuses wrong-type
attributes because Temporal search-attribute type migration is an operator
decision, not a safe automatic repair.

### Wrong-type ADV search attributes

If `adv_temporal_diagnose` reports `wrongType` entries (attributes that exist
but with the wrong Temporal `IndexedValueType`), the dev server has stale
registrations from an earlier session that registered the attributes with
incorrect numeric type codes. ADV does **not** automatically remove these
because in-flight workflows may still reference them — removal is destructive
and must be operator-driven.

#### Symptom

```text
[adv:stsl] ADV search attributes refused (wrong type): \
  AdvProjectId (expected Keyword, got 1), \
  AdvChangeId (expected Keyword, got 1), \
  ...
[adv:stsl] Failed to register ADV search attributes (Visibility queries may fail)
```

`adv_temporal_diagnose` will additionally surface a `wrongType` array under
the `searchAttributes` block listing each affected attribute with its
expected and actual type codes.

#### Detection

```bash
adv_temporal_diagnose
```

Look for `searchAttributes.wrongType.length > 0` in the output.

#### Manual remediation

1. Stop your active OpenCode sessions to avoid mid-removal races.
2. Remove the wrong-type attributes via the Temporal CLI:

   ```bash
   temporal operator search-attribute remove --name AdvProjectId --yes
   temporal operator search-attribute remove --name AdvChangeId --yes
   temporal operator search-attribute remove --name AdvChangeStatus --yes
   temporal operator search-attribute remove --name AdvActiveGate --yes
   temporal operator search-attribute remove --name AdvDoomLoopActive --yes
   ```

3. Restart your OpenCode session. ADV's `initStsl` will re-register the
   attributes with the correct type codes on the next session start.
4. Re-run `adv_temporal_diagnose` to confirm `searchAttributes.ok=true`.

#### Persistence note

If your dev server is running with the default ephemeral SQLite (no
`--db-filename`), the registrations are lost on every restart. Switch to
the persistent variant (see SETUP.md → "Persistent dev-server storage")
to retain the corrected registrations across restarts and prevent future
wrong-type accumulation.

#### Why no auto-cleanup

ADV's registration tool refuses to remove existing attributes because
removal can break in-flight workflows that reference them. Cleanup must
be an explicit operator action, not a side effect of plugin
initialization.

### Stale STSL connection

If Temporal is serving and workers are alive but ADV tools still fail with
connection or service-layer errors, reconnect the shared Temporal service layer:

```bash
adv_temporal_reconnect
```

This does not mutate workflow state and does not restart workers. It replaces
the cached STSL connection/client and reports reconnect counters before/after.

### Worker restart

If diagnose reports `worker_process_alive=false` or no worker queues are
registered, restart the worker:

```bash
adv_temporal_worker_restart
```

The restart output includes STSL status and recommends `adv_temporal_diagnose`
if tools still fail. Keep worker restart and STSL reconnect conceptually
separate: restart owns worker lifecycle; reconnect owns the client connection.

### Workflow repair

If diagnose shows a missing project/change workflow after server, search
attributes, STSL, and worker health are OK, run workflow repair with explicit
approval:

```bash
adv_workflow_repair changeId: "<change-id>" approvalEvidence: "<how user approved>"
```

Repair now reports phase-specific failures. If project rebuild succeeds but
change re-import fails, the tool reports `phase: "reimport-change"` and
`projectRebuilt: true` instead of a generic `Failed to start Workflow`.

### Orphan sweep

Use orphan sweep when disk snapshots exist but change workflows are missing in
Temporal.

Preview only (default, no mutation):

```bash
adv_orphan_sweep dryRun: true
```

Re-seed missing workflows (requires explicit approval):

```bash
adv_orphan_sweep dryRun: false approvedByUser: true approvalEvidence: "<how user approved>"
```

### External restart boundary

Restart OpenCode only when diagnostics cannot run, the plugin is fully degraded
to `ADV_PLUGIN_INIT_FAILED` stubs, or the host process itself is wedged. If ADV
tools are live, prefer `adv_temporal_diagnose` first so recovery preserves
evidence and avoids noisy retry loops.

## Failed migration recovery

Use this when a project's import ledger is not `done`.

1. Run `adv_status` and `adv_temporal_diagnose`, then inspect:
   - `migration_status.status`
   - `migration_status.detail`
   - `temporal_health.server_alive`
   - `temporal_health.worker_process_alive`
   - `searchAttributes.ok`
   - `recommendedNextAction`
2. Classify the failure:
   - `server_alive: false` → Temporal runtime/server problem first
   - `searchAttributes.ok: false` → register missing ADV search attributes with user approval
   - `worker_process_alive: false` with `server_alive: true` → worker crash / restart exhaustion
   - `migration_status.status: failed` with detail → workflow reached a terminal failure state
   - `migration_status.status: empty|unknown|null` → no usable import ledger yet; treat as incomplete bootstrap / recovery state
3. Recover in order:
   - Register missing search attributes with `adv_temporal_register_search_attributes` when diagnosed
   - Reconnect stale STSL with `adv_temporal_reconnect` when diagnosed
   - Restart the worker with `adv_temporal_worker_restart`
   - Re-check `adv_status`
   - If worker/STSL/search attributes are healthy but project or change workflow state is still wrong, run `adv_workflow_repair` with explicit user approval evidence
4. Re-verify with `adv_status` until `migration_status.status` returns to `done`.

### Expected ledger meanings

| Ledger state      | Meaning                                                | Operator action                            |
| ----------------- | ------------------------------------------------------ | ------------------------------------------ |
| `done`            | Project import succeeded                               | No action                                  |
| `failed` + detail | Workflow/import hit a terminal error                   | Fix root cause, then `adv_workflow_repair` |
| `empty`           | Project workflow exists but has no import ledger entry | Restart worker, then re-check              |
| `null` / missing  | No reachable workflow state yet                        | Check server + worker health first         |

## Worker auto-respawn troubleshooting

The Bun-host path uses one Node child per queue with restart backoff `1s -> 3s -> 10s` and a hard cap of 3 restart attempts.

### Signals to inspect

- `adv_status.temporal_health.server_alive`
- `adv_status.temporal_health.worker_alive`
- `adv_status.temporal_health.worker_process_alive`
- `adv_status.temporal_health.registered_queues`
- `adv_status.temporal_health.last_error`

### Common cases

| Health shape                                                           | Likely cause                                                 | Fix                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `server_alive=false`                                                   | Temporal dev server unreachable                              | Start / restore Temporal runtime first                                                        |
| `server_alive=true`, `searchAttributes.ok=false`                       | Required ADV search attributes missing or wrong type         | Run `adv_temporal_register_search_attributes` with approval, or manually fix wrong-type attrs |
| `server_alive=true`, workers alive, service errors persist             | Stale STSL connection/client                                 | Run `adv_temporal_reconnect`, then `adv_temporal_diagnose`                                    |
| `server_alive=true`, `worker_alive=true`, `worker_process_alive=false` | OOP child crashed and exhausted restart budget               | Run `adv_temporal_worker_restart`; inspect `last_error`                                       |
| `worker_alive=false`                                                   | No worker registered (init failure or early bootstrap abort) | Check init logs, Node availability, and Temporal server reachability                          |
| Bun host + init error about Node                                       | Node binary not found                                        | Install Node or set `ADV_NODE_PATH`                                                           |
| Error about worker bundle not found                                    | Dist worker missing for OOP path                             | Run `pnpm run build:worker` in `plugin/`                                                      |

### OOP runtime hardening and tuning

The out-of-process worker has two bounded surfaces operators can observe and, in future releases, tune:

| Surface               | Current default                                      | What it controls                                                                                                                          |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shutdown grace period | `5000` ms (`OOP_SHUTDOWN_GRACE_MS`)                  | Time between `SIGTERM` and escalating to `SIGKILL` during worker shutdown. A child that does not exit within this window is force-killed. |
| Readiness polling     | Implicit via `canReachTemporalAddress(address, 250)` | Plugin-init probes the Temporal server before creating the worker. The 250 ms timeout prevents a hung server from blocking init.          |

These values are compile-time constants today. If you need to adjust them for a specific host (e.g. slower disks or overloaded CI runners), open an issue — the next likely step is env-based overrides (`ADV_OOP_SHUTDOWN_GRACE_MS`, `ADV_TEMPORAL_PROBE_TIMEOUT_MS`).

## `NonDeterministicWorkflowError` recovery

Treat this as a workflow-state corruption / code-history mismatch problem, not a transient retry.

1. Confirm the error in logs or `last_error`.
2. Do **not** keep restarting the same worker hoping it clears.
3. Get explicit user approval.
4. Run `adv_temporal_diagnose` to confirm server/search-attribute/STSL/worker health.
5. Run `adv_workflow_repair` for the affected change.
6. Re-run `adv_temporal_diagnose` and confirm the project/change workflow is healthy again.

`adv_workflow_repair` is the supported operator path because it:

- terminates the broken project workflow,
- rebuilds workflow state from the legacy snapshot,
- re-imports the requested change,
- re-emits derived agenda/wisdom exports.

## Stale `adv/change/*` and `adv/project/*` workflows

Orphaned workflows occur when a bulk enqueue creates `adv/change/*` or `adv/project/*` executions on a task queue that has **no live poller**. The first workflow task is scheduled but never dispatched, so the execution remains in `Running` state indefinitely.

Disk-only orphaned changes are the inverse shape: a `change.json` snapshot exists
but its `adv/change/*` Temporal workflow is missing. Use `adv_orphan_sweep`
dry-run to detect these safely, then execute with user approval to re-seed.

### Symptoms

- `adv_agenda_add` (and other tools that route through the project workflow) fails with `Temporal worker not ready for queue advance-{projectId}` in repos that never started a local worker.
- `temporal workflow list` shows thousands of `Running` workflows with only 2 history events (`WorkflowExecutionStarted`, `WorkflowTaskScheduled`).
- `temporal task-queue describe --task-queue advance-{projectId}` shows an empty poller list.

### Detection

Preferred ADV tool:

```bash
adv_orphan_sweep dryRun: true
```

Manual Temporal CLI checks:

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
- **`preventRecoverOrphanedTemporal`** — added the original orphaned-workflow prevention policy and `adv_status` stale-queue guardrail.
- **`improveAdvPostCrashTemporal`** (this change) — added diagnose-first recovery, search-attribute remediation, STSL reconnect guidance, repair/orphan-sweep sequencing, and the external restart boundary.

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

## Starting workflows en masse

Any code that enqueues more than a handful of workflows in a loop must satisfy **at least one** of the following three safeguards before running against a real Temporal server:

1. **Register pollers for every task queue** the loop targets — a workflow with no poller is an orphan from the moment it is started.
2. **Guarantee termination on cleanup** — a `finally` block (or equivalent) that terminates every started workflow if the process exits before completion.
3. **Use `TestWorkflowEnvironment`** — run the bulk enqueue against an ephemeral in-process server that is torn down after validation.

### Positive pattern

```typescript
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { withTestWorkflowEnvironment } from "./with-test-env";

async function dryRunBulkEnqueue(
  changes: Change[],
  projectId: string,
): Promise<void> {
  await withTestWorkflowEnvironment(
    () => TestWorkflowEnvironment.createLocal(),
    async (env) => {
      const queue = `advance-${projectId}`;
      for (const change of changes) {
        await ensureChangeWorkflowStarted(change, env.client, queue);
      }
      // Verify nothing leaked before teardown
      const count = await env.client.workflow.count(
        `TaskQueue="${queue}" AND ExecutionStatus="Running"`,
      );
      console.assert(count.count === changes.length, "All workflows started");
    },
  );
  // Server is torn down here — no orphaned workflows left behind.
}
```

### Anti-pattern

> **2026-04-20 dogfood migration shape**
>
> ```typescript
> // ❌ DO NOT DO THIS
> for (const change of changes) {
>   await ensureChangeWorkflowStarted(change, realClient, queue);
> }
> // Worker polls only ONE queue; wall-clock deadline exits the process;
> // no termination step. Result: 5,447 orphaned workflows.
> ```
>
> Characteristics that make this dangerous:
>
> - Loop runs against the **real** dev server (`127.0.0.1:7233`), not a test environment.
> - Only **one** task queue has a registered poller; other queues are orphaned immediately.
> - A **wall-clock deadline** (`DEADLINE_MS`) exits the process whether or not all workflows reached `done`.
> - **No termination step** on cleanup — `worker.shutdown()` stops the poller but leaves started workflows in `Running` state.

## Workflow Versioning Convention

This section documents the R2 convention for safely evolving Temporal workflow handlers when a breaking behavior change must ship. It applies per-handler only when a future breaking change actually ships; do not add preemptive versioning.

### When to apply `wf.patched`

Use `wf.patched` **only** when shipping a behavior change to a **mutation handler** (an update or signal that mutates workflow state). Read-only queries do not need patching because they do not affect workflow determinism.

### Naming pattern

- Format: `op-name-vN`
- Lowercase, hyphen-separated
- Must match an entry in `CHANGE_WORKFLOW_UPDATE_NAMES` (or the equivalent signal enum) so the workflow can reference it by a stable identifier

Examples:

| Handler | Patch name |
| ------- | ---------- |
| `addTask` | `add-task-v1` |
| `completeGate` | `complete-gate-v1` |
| `cancelTask` | `cancel-task-v1` |

### Branch structure

Inside the handler, branch on `wf.patched('<op-name-vN>')`:

- **True branch** — new behavior (the changed logic)
- **False branch** — preserved old behavior (exact logic that existed before the patch)

This guarantees that:

1. **Existing executions** (started before the patch) continue to replay through the false branch deterministically.
2. **New executions** (started after the patch) execute the true branch.
3. **Mixed-history executions** (started before, continued after) replay old history on the false branch and run new history on the true branch.

### Example: `addTaskUpdate`

```typescript
import * as wf from '@temporalio/workflow';

export const addTaskUpdate = wf.defineUpdate<AddTaskResult, [AddTaskInput]>('addTask');

export async function addTaskHandler(wfCtx: typeof wf, input: AddTaskInput): Promise<AddTaskResult> {
  if (wfCtx.patched('add-task-v1')) {
    // New behavior: validate input against updated schema, then append
    validateAddTaskV1(input);
    const task = createTaskV1(input);
    state.tasks.push(task);
    return { taskId: task.id };
  } else {
    // Preserved old behavior: legacy append without V1 validation
    const task = createTaskLegacy(input);
    state.tasks.push(task);
    return { taskId: task.id };
  }
}
```

### Cross-references

- `design.md` § KD-1 — full design context, including why preemptive `wf.patched` was removed and how the validator recommended this documented-convention approach.

## Background and references

### 2026-04-21 Bun crash-loop incident

The hybrid worker model exists because earlier wiring of the Temporal swap into the plugin bootstrap caused every opencode session to crash-loop with a wall of warn/error spam. Captured here so the cause + fix are discoverable from the doc tree, not only from ADV-state wisdom.

- **Symptom:** every opencode session emitted `[plugin-init] (warn) Plugin init failed: Webpack finished with errors ...` plus continuous `temporalio_client` retry errors. Sessions became unusable; `adv_*` tools returned `ADV_PLUGIN_INIT_FAILED` stubs.
- **Root cause:** opencode ships as a compiled Bun 1.3.8 binary. `@temporalio/worker.Worker.create()` internally spawns a Workflow Worker Thread whose `require('@temporalio/common')` fails from Bun's install-cache path. The "Webpack finished with errors" message is misleading boilerplate — webpack itself succeeds. Upstream: [temporalio/sdk-typescript#1334](https://github.com/temporalio/sdk-typescript/issues/1334), [oven-sh/bun#27058](https://github.com/oven-sh/bun/issues/27058), [oven-sh/bun#27464](https://github.com/oven-sh/bun/issues/27464).
- **Triggered by:** `replaceAdvStorageLayerTemporal` scaffold landing + `migrateAdvStateTemporalRetire` Phase A wiring Temporal into plugin bootstrap.
- **Historical workaround:** during the 2026-04-21 incident, some hosts temporarily set `ADV_DISABLE_TEMPORAL=1` in shell config to route through the file-backed harness. That workaround is now retired and should be removed if still present.
- **Permanent fix:** shipped in `fixTemporalWorkerBundleFailure` (archived 2026-04-21). The hybrid worker model documented above (Node host → in-process; Bun host → out-of-process Node child via `createOutOfProcessWorker`) is the structural answer. Phase 1 also narrowed the `logger.warn` → `logger.info` for the Temporal-init failure path so it stops reaching the console, added a fast `canReachTemporalAddress()` short-circuit so `adv_status` no longer hangs ~5s when the server is offline, and later Temporal-only cutover work removed runtime fallback flags entirely. Phase 3 hardened workflow determinism (`gate-reentry.ts` accepts an explicit `now`) and added the `withTestWorkflowEnvironment` helper to prevent `/tmp/temporal-test-server-*` zombie-proc leaks.

### Cross-references

| Where              | Pointer                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Public bug         | [Sharper-Flow/Advance#5](https://github.com/Sharper-Flow/Advance/issues/5)                               |
| Trunk merge commit | `e8e332c` (`Merge branch 'change/fixTemporalWorkerBundleFailure' into trunk`)                            |
| Archive            | `~/.local/share/opencode/plugins/advance/<projectId>/archive/2026-04-21-fixTemporalWorkerBundleFailure/` |
| Related changes    | `fixTemporalWorkerBundleFailure`, `migrateAdvStateTemporalRetire`, `preventRecoverOrphanedTemporal`      |
