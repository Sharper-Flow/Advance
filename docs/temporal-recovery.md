# Temporal Recovery Runbook

> **Status:** worker-model and recovery baseline. This runbook now outlives the retired cutover harness and remains the operator reference for post-crash diagnosis, worker-model decisions, failed-migration recovery, worker auto-respawn troubleshooting, `NonDeterministicWorkflowError` recovery, orphan cleanup, and disk-full / OOM surfaces.

## Mid-batch content-signal failure recovery

> **Constraint C8** from the `removePositionalArtifactApi` change (May 2026).

`Store.changes.updateArtifacts(changeId, artifacts: ArtifactPayload)` and `Store.changes.create(summary, { artifacts })` fan out one Temporal signal per defined field on `ArtifactPayload`, in deterministic order (`proposal → problemStatement → agreement → design → executiveSummary → acceptance`). Each signal is awaited before the next; tool layer never uses `Promise.all`.

### What can fail mid-batch

A signal handler can fail to reach the workflow if:

- The Temporal frontend rejects the signal (e.g., workflow doesn't exist, deserialization error).
- The worker pool is unavailable (worker crashed, queue not serviceable).
- The tool process crashes/exits between two signals in the same batch.

When this happens, the workflow's `state.documents` is **partially populated** — signals 1..N-1 have already been applied; signals N..6 have not. Disk artifact files for signals 1..N-1 may also be present (transition window before T15 removes disk-writes entirely).

### Crash-recovery semantics

Content signals are **idempotent state-replacement**, not delta. Re-issuing `updateArtifacts(id, samePayload)` after a mid-batch crash is safe:

- Signals already applied (1..N-1) re-fire and overwrite their own state with identical content — no-op effect.
- Signals not yet applied (N..6) fire fresh.
- Final state is identical to a single successful batch.

This invariant is locked by `plugin/src/temporal/change-state.crash-recovery.test.ts` and follows directly from `applyContentWithSizeGuard` semantics (the size-guard wrapper still uses last-write-wins state replacement).

### Recovery procedure

1. **Diagnose:** Query `state.documents` via `adv_change_show changeId: X include: { proposal: true, problemStatement: true, agreement: true, design: true, executiveSummary: true, acceptance: true }`. Compare with the intended payload. Identify missing fields.
2. **Re-issue:** Call `adv_change_update changeId: X` with the **full intended payload** (not just the missing fields — re-issuing already-applied content is a safe no-op). The tool layer's sequential-await fan-out picks up where it left off.
3. **Verify:** Re-query `state.documents`. All six fields should match the intended content.

### Distinction from poisoned-history recovery

The acceptance-gate recovery path (`gate.ts:344-414`, `_recovery-writers.ts`) is **separate from this content-signal recovery flow**. Poisoned-workflow recovery uses `inspectArtifactActivity` to read disk files when Temporal cannot accept signals at all (workflow stuck on a non-deterministic replay error, history truncation, etc.). That path retains disk dependency by design (C12) and is not part of the mid-batch-signal-failure recovery procedure above.

> **State-backed acceptance (completeStateBackedGate, May 2026).** The acceptance gate's **non-recovery** completion path is now fully state-backed, matching proposal/discovery/design. Under the `STATE_BACKED_ACCEPTANCE_PROOF_PATCH` workflow patch marker, acceptance proof is read from `state.documents.executiveSummary` + `state.artifacts.executiveSummary` metadata (`contentHash` plus source/readability context; `path` only when materialized) — no disk `inspectArtifactActivity`. At acceptance time the workflow materializes `executive-summary.md` and `acceptance.md` to the active change dir via `writeArtifactActivity` so the readdir-based archive bundle (`createInRepoArchive`) includes them (AC7). The legacy `ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH` disk-inspect branch is retained only for replay of pre-migration histories; new histories never take it. The poisoned-history **recovery** path described above is unchanged and still inspects disk per C12 — the two paths coexist exactly as the production-vs-recovery split for the other gates.

## Stuck proposal/discovery/design/acceptance gates after artifact disk writes were removed

> Applies to the `fixGateArtifactReadiness` change (May 2026); the acceptance
> gate joined the state-backed model in `completeStateBackedGate` (May 2026).

`Store.changes.updateArtifacts(...)` no longer writes active `proposal.md`,
`agreement.md`, or `design.md` files from the Temporal store path. The canonical
artifact content for proposal/discovery/design gates is workflow state:

- `state.documents[kind]` — artifact content
- `state.artifacts[kind]` — optional path/hash metadata

### Symptom

A proposal, discovery, design, or acceptance gate is stuck with
`ARTIFACT_MISSING` (acceptance reports `ACCEPTANCE_EXECUTIVE_SUMMARY_MISSING`)
even though `adv_change_show` displays the artifact content (for example, an
agreement exists in workflow state but `agreement.md` is absent on disk, or the
executive summary exists in `state.documents.executiveSummary` but
`executive-summary.md` is absent on disk). This was observed in
PokeEdge/PokeEdge-web style sessions such as a stuck discovery gate for
`fixSubDollarLabels`.

### Recovery procedure

1. Build and deploy the fixed Advance plugin:

   ```bash
   cd /home/jon/dev/advance/plugin && pnpm run build
   cd /home/jon/dev/advance && ./scripts/deploy-local.sh --fix
   ```

2. Restart OpenCode in the affected project(s). A running session may report
   `Plugin freshness: dist_ahead_of_process`; restart is required so the plugin
   host loads the new `dist/` code.

3. Re-enter the stuck gate from the affected project using ADV tools. For a
   stuck discovery gate:

   ```text
   adv_change_reenter changeId: "<change-id>" fromGate: "discovery" reason: "Retry after state-backed artifact readiness fix"
   ```

4. Retry the normal gate completion. Do **not** create or edit `agreement.md`,
   `proposal.md`, `design.md`, or `executive-summary.md` manually just to
   satisfy gate readiness. Disk artifact files are not the source of truth for
   proposal/discovery/design/acceptance on the fixed path — the workflow
   materializes `executive-summary.md`/`acceptance.md` to disk itself at
   acceptance time for the archive bundle.

### Interaction with per-project OpenCode wrappers

The `addPerProjectOcWrapper` work in `~/toolbox` can improve project-specific
XDG/process isolation and make restarts less ambiguous, but it does not repair
the plugin bug by itself. The plugin fix and a fresh OpenCode process are still
required.

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

Until one of those triggers fires, keep the current runtime-selected hybrid worker model. Adding shards or dedicated services before they're needed pays the operational cost without the benefit.

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
- worker role (`worker_role`: `host`, `client`, or `degraded`)
- worker lock heartbeat health (`worker_lock`)
- last worker-run failure telemetry (`last_worker_run_error`)
- change workflow reachability
- required ADV search-attribute status
- stale queues
- probe `_freshness` (`cached_at`, `stale`, optional `error`)
- last Temporal error
- recommended next action

`adv_status view: "health"` also shows feature flags. `worker_singleton_enforce`
default true; rollback/debug escape hatches are setting that flag false or
`ADV_FORCE_IN_PROCESS_WORKER=1`. `worktree_guard_enforce` default true
post-rollout (rq-autoManageAdvWorktrees AC2); when omitted or true, the trunk
write firewall blocks default-checkout file writes and classified destructive
bash writes. Pre-flip behavior (omitted or false allows default-checkout file
writes) is preserved only when `worktree_guard_enforce` is explicitly false —
the legacy escape hatch for projects that want to keep editing in the main
checkout.

Restart verification timeout: `ADV_WORKER_RESTART_VERIFY_TIMEOUT_MS` defaults to
10000 ms. Raise only when Temporal queue serviceability is slow but healthy.

Plain anchors for drift tests: worker_singleton_enforce default false; worktree_guard_enforce default true.

Stale `_freshness` values are diagnostic-only. Do not treat stale serviceability
as proof of restart success, worker-lock reclaim safety, override safety, or
archive readiness.

### Stability rollout canary

After upgrade, verify:

1. `adv_status view:"health"` returns `worker_role` and both feature flags.
2. First session on project reports `worker_role: "host"`; peers report `client`.
3. With `worktree_guard_enforce=true`, main-checkout task/gate mutations block
   with `WorktreeIsolationViolation`; same call from `adv_worktree_resume` path
   proceeds.
4. Restart verification success includes non-stale `_freshness` for
   `restart_serviceability`.

### Worker lock heartbeat fields

`adv_status view: "health"` exposes the raw `temporal_health.worker_lock`
object. `adv_temporal_diagnose` also renders a compact `worker_lock` string when
the lock exists.

| Field                           | Meaning                                                    | Operator interpretation                                                                                                              |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `worker_lock.holder_pid`        | PID that currently owns `{project-state-dir}/worker.lock`  | Use to correlate with the OpenCode/plugin process. An alive PID alone is not sufficient proof that a worker is polling.              |
| `worker_lock.schema_version`    | Lock format version (`1` legacy, `2` heartbeat-aware)      | `1` means PID-only fallback; `2` includes heartbeat freshness and can be reclaimed when stale.                                       |
| `worker_lock.last_heartbeat_at` | Last successful heartbeat write from the lock holder       | Fresh values mean the holder is actively renewing ownership. `null` means legacy or unreadable heartbeat state.                      |
| `worker_lock.heartbeat_age_ms`  | Age of the latest heartbeat at probe time                  | Values above `STALE_HEARTBEAT_MS` (`60000` ms by default) indicate normal stale-lock reclaim should happen on the next peer startup. |
| `last_worker_run_error`         | Last observed `Worker.run()` or restart-exhaustion failure | Use with `worker_alive` / `worker_process_alive` to distinguish a crashed poller from a missing server/STSL issue.                   |

If `worker_lock` or `last_worker_run_error` is `null`, formatted output omits the
field. Null is quiet by design; use the raw `temporal_health` block only when you
need exact diagnostics.

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

If these attributes are missing, change workflow starts may fail with generic errors such as:

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
registered, restart the worker only when the expected queue is not blocked by a
live suspect lock:

```bash
adv_temporal_worker_restart
```

`adv_temporal_worker_restart` is **verified, not fire-and-forget**: it spawns a
new worker, then awaits queue serviceability proof (default 10 s budget) before
returning `success: true`. Failure responses include a structured envelope —
expected queue, registered queues, worker lock, queue serviceability snapshot,
stale running workflow count, worker diagnostics, and `recommendedNextAction` —
so callers can act without re-running blind restart loops.

Restart verification force-refreshes serviceability probes. Cached stale probe
data can explain the recommendation but cannot by itself make restart return
`success: true`.

The restart output includes STSL status and recommends `adv_temporal_diagnose`
if tools still fail. Keep worker restart and STSL reconnect conceptually
separate: restart owns worker lifecycle; reconnect owns the client connection.
`adv_temporal_reconnect` is STSL/client-only and is not a worker-registration or
queue-serviceability recovery path.

#### Approval-gated suspect live legacy v1 lock

A live PID holding a v1-schema `worker.lock` with no heartbeat is **suspect**:
it might be a wedged owner or a peer that genuinely owns the queue. The
restart tool refuses to silently reclaim it. The failure envelope sets
`reason: "suspect_live_legacy_lock"`, `approvalRequired: true`, and the
`recommendedNextAction` asks for explicit approval evidence or an OpenCode
session restart.

To reclaim with explicit approval (rare; only when the owner is known wedged):

```bash
adv_temporal_worker_restart \
  approvedLockReclaim: true \
  approvalEvidence: "<how the user approved>"
```

Approved reclaim records prior PID, schema version, expected queue, and the
approval evidence in the lock audit trail. Healthy serviceable v2 locks
(heartbeat fresh) are never reclaimed by this path; their stale-heartbeat path
is described below.

#### Approval-gated fresh v2 unserviceable lock

A fresh v2 heartbeat proves the lock holder process is still renewing the lock;
it does **not** prove the expected Temporal task queue is serviceable. If
diagnose reports `worker_lock.schema_version=2`, a fresh heartbeat, and
`queue_serviceability.status="not_serviceable"`, the lock is suspect rather than
healthy.

The restart tool refuses blind reclaim and returns
`reason: "suspect_live_unserviceable_lock"`, `approvalRequired: true`, and a
recommendation to restart the owning OpenCode session or rerun with explicit
approval evidence. Do not use `adv_temporal_reconnect` for this shape; reconnect
only refreshes the STSL/client plane and cannot make a worker poll a queue.

#### Bounded recovery at the change-workflow access seam

Hot-path tools that need workflow-backed access (notably `adv_worktree_create`
via `tools/worktree/state.ts`) resolve the change workflow handle directly.
When the local readiness check fails, the tool returns `unavailable`
with `recommendedNextAction` requiring explicit operator intervention — never
recommends in-place edits as fallback.

- If Temporal is reachable, the caller continues unchanged.
- If recovery hits a suspect live v1 lock, the helper returns `unavailable`
  with `recommendedNextAction` requiring explicit approval — never recommends
  in-place edits as fallback.
- If the change workflow is unreachable for any other reason, the helper returns `unavailable` with
  a `queueServiceability` snapshot and asks the caller to run
  `adv_temporal_diagnose`.

#### Poller rows are freshness evidence, not durable worker records

`temporal task-queue describe` exposes pollers with `lastAccessTime`. ADV
treats poller rows as **freshness evidence**, not as a durable worker
registry. A live worker keeps refreshing its poller row by polling the queue;
a wedged or exited worker stops refreshing it, so the row ages out (`stale`)
and eventually disappears (`none`). Conversely, the **absence of a fresh
poller row does not by itself prove the worker is dead** — it proves the
queue cannot be served _right now_ through that probe path.

Queue serviceability classification combines local evidence (registered
queues, worker aliveness, ownership) with server poller probe status. A queue
is serviceable when the local owner is healthy OR the server reports a fresh
poller, and not_serviceable when neither plane confirms a live worker. This
is the source of truth for verified restart and bounded recovery — not the
poller row alone.

### Stale heartbeat reclaim

Heartbeat-aware worker locks prevent a zombie holder from blocking later
sessions forever. A v2 lock is considered reclaimable when its PID is still alive
but `worker_lock.heartbeat_age_ms > STALE_HEARTBEAT_MS` (`60000` ms default).
The next peer session that calls `acquireWorkerLock` may replace the stale holder
and start a fresh worker.

Operator playbook:

1. Run `adv_temporal_diagnose`.
2. If `server_alive=true`, `worker_alive=false`, and `worker_lock.heartbeat_age_ms > 60000`, treat `recommendedNextAction: "normal recovery — peer worker spawn pending"` as informational.
3. Start or retry the blocked ADV command in the peer session. The peer should reclaim the lock during plugin init / worker startup.
4. Re-run `adv_temporal_diagnose` only if tools still time out or the recommendation does not change after one fresh startup.
5. If `last_worker_run_error` is populated, inspect it before repeated restarts; repeated identical failures are not transient.

Do not manually delete `worker.lock` while a healthy heartbeat is fresh. Healthy
v2 locks should renew every `HEARTBEAT_INTERVAL_MS` (`5000` ms default), and false
reclaim under normal load is a bug.

### Worker-exhaustion surrender path (KD-K)

When every local worker queue has failed or the out-of-process child exhausts
its restart budget, plugin-init's `onWorkerExhausted` callback performs a fast,
best-effort surrender:

1. Stop the registered heartbeat writer for the project state dir.
2. Release this session's owned `worker.lock`.
3. Record `last_worker_run_error` with queue `<all>` and message `worker exhausted`.
4. Remove the exhausted worker from local aliveness tracking.

This path is idempotent. It lets a peer reclaim immediately instead of waiting
for the full stale-heartbeat grace window, while still preserving telemetry for
operators.

### External restart boundary

Restart OpenCode only when diagnostics cannot run, the plugin is fully degraded
to `ADV_PLUGIN_INIT_FAILED` stubs, the host process itself is wedged, or edited
plugin tool code must be reloaded. If ADV tools are live, prefer
`adv_temporal_diagnose` first so recovery preserves evidence and avoids noisy
retry loops.

Reload paths are intentionally separate:

| Changed or failed surface                                                             | Correct reload / recovery                                                                                                                                              |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plugin/src/tools/*.ts` tool code                                                     | Run `pnpm run build` in `plugin/`, then restart OpenCode. `adv_temporal_worker_restart` does not reload host-loaded tool modules.                                      |
| `plugin/src/temporal/*` workflow, activity, or worker harness code                    | Run `pnpm run build:worker` in `plugin/`, then run `adv_temporal_worker_restart`. The worker loads from `dist/temporal/`.                                              |
| Wedged/exhausted Temporal worker process with unchanged source                        | Run `adv_temporal_worker_restart`, then verify with `adv_status` or `adv_temporal_diagnose`.                                                                           |
| Suspect live legacy v1 `worker.lock` (alive PID, no heartbeat, queue not serviceable) | Restart the owning OpenCode session (preferred), or rerun `adv_temporal_worker_restart` with `approvedLockReclaim: true` + `approvalEvidence`. Never reclaim silently. |
| Diagnose unchanged after worker restart                                               | Stop repeating restart; inspect stale worker lock, stale queues, and change workflow state.                                                                            |

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
   - Restart the worker with `adv_temporal_worker_restart` for worker liveness failures; if worker code changed, run `pnpm run build:worker` first
   - Re-check `adv_status`
   - If worker/STSL/search attributes are healthy but change workflow state is still wrong, investigate the specific change with `adv_change_show` and `adv_temporal_diagnose`
4. Re-verify with `adv_status` until `migration_status.status` returns to `done`.

### Expected ledger meanings

| Ledger state      | Meaning                                           | Operator action                     |
| ----------------- | ------------------------------------------------- | ----------------------------------- |
| `done`            | Project import succeeded                          | No action                           |
| `failed` + detail | Workflow/import hit a terminal error              | Fix root cause, then restart worker |
| `empty`           | Change workflows exist but no import ledger entry | Restart worker, then re-check       |
| `null` / missing  | No reachable workflow state yet                   | Check server + worker health first  |

## Worker auto-respawn troubleshooting

The Bun-host path uses one Node child per queue with restart backoff `1s -> 3s -> 10s` and a hard cap of 3 restart attempts.

### Signals to inspect

- `adv_status.temporal_health.server_alive`
- `adv_status.temporal_health.worker_alive`
- `adv_status.temporal_health.worker_process_alive`
- `adv_status.temporal_health.registered_queues`
- `adv_status.temporal_health.last_error`

### Common cases

| Health shape                                                                                                            | Likely cause                                                                            | Fix                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server_alive=false`                                                                                                    | Temporal dev server unreachable                                                         | Start / restore Temporal runtime first                                                                                                                                                                      |
| `server_alive=true`, `searchAttributes.ok=false`                                                                        | Required ADV search attributes missing or wrong type                                    | Run `adv_temporal_register_search_attributes` with approval, or manually fix wrong-type attrs                                                                                                               |
| `server_alive=true`, workers alive, service errors persist                                                              | Stale STSL connection/client                                                            | Run `adv_temporal_reconnect`, then `adv_temporal_diagnose`                                                                                                                                                  |
| `server_alive=true`, `worker_alive=false`, `worker_lock.heartbeat_age_ms > 60000`                                       | Stale heartbeat; peer worker spawn/reclaim is pending                                   | Treat `normal recovery — peer worker spawn pending` as informational; start a fresh peer/session and re-check only if tools still time out                                                                  |
| `server_alive=true`, `worker_alive=true`, `worker_process_alive=false`                                                  | OOP child crashed and exhausted restart budget                                          | Run `adv_temporal_worker_restart`; inspect `last_error` and `last_worker_run_error`. If source under `plugin/src/temporal/*` changed, run `pnpm run build:worker` first.                                    |
| `worker_alive=false`, `worker_lock.schema_version=1`, alive `holder_pid`, no `last_heartbeat_at`, queue not serviceable | Suspect live legacy v1 worker.lock — wedged owner OR peer that genuinely owns the queue | `adv_temporal_worker_restart` returns `approvalRequired: true`. Either restart the owning OpenCode session, or rerun with `approvedLockReclaim: true` + `approvalEvidence`. Do not run blind restart loops. |
| `worker_alive=false`, `worker_lock.schema_version=2`, fresh heartbeat, queue not serviceable                            | Suspect live v2 worker.lock — holder is alive but not serving expected queue            | `adv_temporal_worker_restart` returns `approvalRequired: true`. Restart the owning session or rerun with approval evidence. Do not run `adv_temporal_reconnect` or blind restart loops.                     |
| `worker_alive=false`, `last_worker_run_error` populated                                                                 | Worker.run failure or restart exhaustion already observed                               | Inspect the run-error message; fix the root cause before repeated restarts                                                                                                                                  |
| `worker_alive=false`                                                                                                    | No worker registered (init failure or early bootstrap abort)                            | Check init logs, Node availability, and Temporal server reachability                                                                                                                                        |
| Bun host + init error about Node                                                                                        | Node binary not found                                                                   | Install Node or set `ADV_NODE_PATH`                                                                                                                                                                         |
| Error about worker bundle not found                                                                                     | Dist worker missing for OOP path                                                        | Run `pnpm run build:worker` in `plugin/`                                                                                                                                                                    |

### OOP runtime hardening and tuning

The out-of-process worker has two bounded surfaces operators can observe and, in future releases, tune:

| Surface               | Current default                                      | What it controls                                                                                                                          |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Shutdown grace period | `5000` ms (`OOP_SHUTDOWN_GRACE_MS`)                  | Time between `SIGTERM` and escalating to `SIGKILL` during worker shutdown. A child that does not exit within this window is force-killed. |
| Readiness polling     | Implicit via `canReachTemporalAddress(address, 250)` | Plugin-init probes the Temporal server before creating the worker. The 250 ms timeout prevents a hung server from blocking init.          |

These values are compile-time constants today. If you need to adjust them for a specific host (e.g. slower disks or overloaded CI runners), open an issue — the next likely step is env-based overrides (`ADV_OOP_SHUTDOWN_GRACE_MS`, `ADV_TEMPORAL_PROBE_TIMEOUT_MS`).

## `NonDeterministicWorkflowError` recovery

Treat this as a workflow-state corruption / code-history mismatch problem, not a transient retry.

### Replay/versioning rule

Workflow-affecting changes under `plugin/src/temporal/**` or other workflow-bundled command-producing helpers must run committed replay coverage before archive. Use `Worker.runReplayHistory` against sanitized histories in `plugin/src/temporal/__tests__/replay/histories/`.

If a workflow change adds, removes, or reorders command-producing operations (Activities, timers, search-attribute upserts, patch markers, child workflows, continue-as-new, etc.), choose one evolution strategy before shipping:

| Strategy                     | Use when                                                                                                    | Requirement                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `wf.patched`                 | Local/per-session ADV deployments where old histories must replay and new histories can take the new branch | Patch name, old branch, new branch, and deprecation plan or non-deprecation rationale are documented in code/docs |
| Worker Versioning            | Multiple worker builds may poll the same task queue concurrently                                            | Deployment/build routing is explicit and tested                                                                   |
| Explicit reset/recovery plan | The old history cannot safely replay and the affected workflow set is bounded                               | Exact evidence plus explicit user/operator approval before destructive action                                     |

Worker restart is **not** a repair for `TMPRL1100`, `NonDeterministic`, or `WorkflowTaskFailedCauseNonDeterministicError`. Restart only after code/history compatibility is understood and only to load a fixed worker bundle.

### Poisoned WIP/read-only posture

Cross-change WIP and worktree readers should preserve healthy partial results and surface poisoned workflows as structured metadata (`poisoned_workflows`) plus human-readable warnings. Treat that metadata as triage input only. It must not trigger automatic terminate, reset, reseed, archive, or worktree deletion.

Evidence extraction is split by bundle boundary:

- `plugin/src/tools/recovery-probe.ts` owns tool-layer `describe()` probing via `workflowPoisonedDescriptionEvidence()` and returns bounded evidence summaries.
- `plugin/src/temporal/recovery-classification.ts` owns workflow-safe plain error/evidence classification via `isPoisonedHistoryError()` and `isPrecisePoisonedHistoryEvidence()`.

Keep their core poisoned-history markers aligned (`TMPRL1100`, `NonDeterministic`, `Nondeterminism`, `WorkflowTaskFailedCauseNonDeterministicError`, `No command scheduled`, `WorkflowExecutionUpdateAccepted`). The probe stays outside `temporal/` because it touches workflow handles and must not enter the workflow bundle.

1. Confirm the error in logs or `last_error`.
2. Do **not** keep restarting the same worker hoping it clears.
3. Get explicit user approval.
4. Run `adv_temporal_diagnose` to confirm server/search-attribute/STSL/worker health.
5. Investigate the affected change with `adv_change_show` and `adv_temporal_diagnose`.
6. If the change workflow is terminally corrupted, terminate it via Temporal CLI and let the next access reseed from disk.
7. Re-run `adv_temporal_diagnose` and confirm the change workflow is healthy again.

## Stale `adv/change/*` workflows

Orphaned workflows occur when a bulk enqueue creates `adv/change/*` executions on a task queue that has **no live poller**. The first workflow task is scheduled but never dispatched, so the execution remains in `Running` state indefinitely.

Completed `adv/change/*` executions for `archived` and `closed` changes are
normal. Change workflows now exit once terminal state is reached: the
archive/close update records the final status, the workflow drains in-flight
handlers with `allHandlersFinished`, logs `workflow:completing`, and returns.
Do not re-seed these terminal changes.

### Symptoms

- `temporal workflow list` shows thousands of `Running` workflows with only 2 history events (`WorkflowExecutionStarted`, `WorkflowTaskScheduled`).
- `temporal task-queue describe --task-queue advance-{projectId}` shows an empty poller list.

### Detection

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

### Safe batch-termination for pre-existing zombies

After `terminatechangeworkflowonarchi`, newly archived or closed changes should
appear as `Completed`, not long-lived `Running`, workflows. Batch termination is
for pre-existing zombie executions only: old `Running` `changeWorkflow` rows
with no live poller, no legitimate in-flight work, and a start time before the
fix or incident window.

> **⚠️ Update the date.** Replace `YYYY-MM-DD` below with the day **before** the incident enqueue date so you do not terminate legitimate in-flight work.

```bash
# Terminate orphaned change workflows
temporal workflow terminate \
  --query 'ExecutionStatus="Running" AND WorkflowType="changeWorkflow" AND StartTime < "YYYY-MM-DDT00:00:00Z"' \
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
- **`improveAdvPostCrashTemporal`** — added diagnose-first recovery, search-attribute remediation, STSL reconnect guidance, repair/orphan-sweep sequencing, and the external restart boundary.
- **`fixStuckTemporalWorkerRecovery`** (this change) — replaced fire-and-forget worker restart with a verified 10 s-budget recovery, added approval-gated suspect live legacy v1 lock reclaim (rq-workerSingleton01.6), added queue-serviceability classification (rq-workerHealth01) using local-owner + server-poller-probe evidence, added the bounded `recovery: "once"` seam at `getBoundedProjectWorkflowAccess` for `adv_worktree_create`, and clarified that poller rows are freshness evidence — not durable worker records.
- **`terminatechangeworkflowonarchi`** — made `changeWorkflow` Complete when archive/close sets terminal status, added the `allHandlersFinished` drain before return, rejected re-entry for archived/closed changes with a domain error, and prevented disk re-seeding for terminal archived/closed changes. New `Running` terminal change workflows are no longer expected; cleanup should target only pre-existing zombies.

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
- If workflow state and derived exports diverged, investigate with `adv_change_show` and `adv_temporal_diagnose`

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

| Handler        | Patch name         |
| -------------- | ------------------ |
| `addTask`      | `add-task-v1`      |
| `completeGate` | `complete-gate-v1` |
| `cancelTask`   | `cancel-task-v1`   |

Active ADV patch marker:

| Handler / behavior                | Patch name                        | Purpose                                                                                                                                                                     | Fixture                                          |
| --------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Discovery gate contract readiness | `discovery-contract-readiness-v1` | Legacy discovery histories scheduled artifact inspection before contract-readiness enforcement; histories without the marker must replay the old no-contract-blocker branch | `fixGateAutoWorktree.discovery-gate-tmprl1100.*` |

The patch is defined as `DISCOVERY_CONTRACT_READINESS_PATCH` in `plugin/src/temporal/workflows.ts`. Keep it until pre-contract discovery histories are archived/closed and the replay fixture no longer needs that migration path; then deprecate with `wf.deprecatePatch` before final removal.

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
import * as wf from "@temporalio/workflow";

export const addTaskUpdate = wf.defineUpdate<AddTaskResult, [AddTaskInput]>(
  "addTask",
);

export async function addTaskHandler(
  wfCtx: typeof wf,
  input: AddTaskInput,
): Promise<AddTaskResult> {
  if (wfCtx.patched("add-task-v1")) {
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

- This section is the canonical runbook summary for the documented-convention
  approach: do not add preemptive `wf.patched` calls; add a patch marker only
  when a workflow change intentionally supports both old and new replay
  branches.

## Background and references

### 2026-04-21 Bun crash-loop incident

The hybrid worker model exists because earlier wiring of the Temporal swap into the plugin bootstrap caused every opencode session to crash-loop with a wall of warn/error spam. Captured here so the cause + fix are discoverable from the doc tree, not only from ADV-state wisdom.

- **Symptom:** every opencode session emitted `[plugin-init] (warn) Plugin init failed: Webpack finished with errors ...` plus continuous `temporalio_client` retry errors. Sessions became unusable; `adv_*` tools returned `ADV_PLUGIN_INIT_FAILED` stubs.
- **Root cause:** opencode ships as a compiled Bun 1.3.8 binary. `@temporalio/worker.Worker.create()` internally spawns a Workflow Worker Thread whose `require('@temporalio/common')` fails from Bun's install-cache path. The "Webpack finished with errors" message is misleading boilerplate — webpack itself succeeds. Upstream: [temporalio/sdk-typescript#1334](https://github.com/temporalio/sdk-typescript/issues/1334), [oven-sh/bun#27058](https://github.com/oven-sh/bun/issues/27058), [oven-sh/bun#27464](https://github.com/oven-sh/bun/issues/27464).
- **Triggered by:** `replaceAdvStorageLayerTemporal` scaffold landing + `migrateAdvStateTemporalRetire` Phase A wiring Temporal into plugin bootstrap.
- **Historical workaround:** during the 2026-04-21 incident, some hosts temporarily set `ADV_DISABLE_TEMPORAL=1` in shell config to route through the file-backed harness. The flag is no longer recognized; setting it has no effect. It can be removed from shell config if still present.
- **Permanent fix:** shipped in `fixTemporalWorkerBundleFailure` (archived 2026-04-21). The hybrid worker model documented above (Node host → in-process; Bun host → out-of-process Node child via `createOutOfProcessWorker`) is the structural answer. Phase 1 also narrowed the `logger.warn` → `logger.info` for the Temporal-init failure path so it stops reaching the console, added a fast `canReachTemporalAddress()` short-circuit so `adv_status` no longer hangs ~5s when the server is offline, and later Temporal-only cutover work removed runtime fallback flags entirely. Phase 3 hardened workflow determinism (`gate-reentry.ts` accepts an explicit `now`) and added the `withTestWorkflowEnvironment` helper to prevent `/tmp/temporal-test-server-*` zombie-proc leaks.

### Cross-references

| Where              | Pointer                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| Public bug         | [Sharper-Flow/Advance#5](https://github.com/Sharper-Flow/Advance/issues/5)                               |
| Trunk merge commit | `e8e332c` (`Merge branch 'change/fixTemporalWorkerBundleFailure' into trunk`)                            |
| Archive            | `~/.local/share/opencode/plugins/advance/<projectId>/archive/2026-04-21-fixTemporalWorkerBundleFailure/` |
| Related changes    | `fixTemporalWorkerBundleFailure`, `migrateAdvStateTemporalRetire`, `preventRecoverOrphanedTemporal`      |
