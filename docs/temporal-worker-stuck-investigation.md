# Temporal Worker Stuck Investigation

Created: 2026-05-04
Owner: ADV investigation
Status: active investigation

## Incident Summary

Multiple concurrent OpenCode agents in `/home/jrede/dev/pokeedge-web` are blocked before `/adv-apply` execution because `adv_worktree_create` cannot reach the project workflow. The shared symptom is a Temporal server that is alive, with running workflows on the project queue, but no locally registered poller from the affected plugin session.

## Linked Issues

| Issue | Change | Signal |
| --- | --- | --- |
| [#22](https://github.com/Sharper-Flow/Advance/issues/22) | `improvePriceHistoryGraphVisual` | `adv_temporal_worker_restart` reports success but diagnose remains worker-down/stale-lock. |
| [#23](https://github.com/Sharper-Flow/Advance/issues/23) | `balanceCardDetailHeaderRows` | Same `adv_worktree_create` block and unchanged diagnose after restart. |
| [#24](https://github.com/Sharper-Flow/Advance/issues/24) | `rebalanceCardDetailPricing` | Worker child processes respawn but never register; only OpenCode restart recovers. |

## Shared Diagnostic Shape

```text
server_alive: true
worker_alive: false
worker_process_alive: false
registered_queues: []
stale_queues: [{ queue: "advance-67fe3e95bc2afb49e94cada183986fa1712e47d5", running_count: 6 }]
worker_lock.holder_pid: 3011283
worker_lock.schema_version: 1
worker_lock.last_heartbeat_at: null
worker_lock.heartbeat_age_ms: null
```

Additional host evidence captured from the Advance repo session:

```text
ps -p 3011283 -o pid=,ppid=,stat=,etime=,comm=,args=
3011283    3874 Ssl+    06:12:33 opencode        opencode
```

## Working Hypotheses

1. **Fire-and-forget restart masks failure.** `adv_temporal_worker_restart` returns `success: true` after initiating restart, before queue registration is observable.
2. **Worker registry/IPC desync.** A `worker.js` child can exist while parent plugin state still reports `registered_queues: []` and `worker_process_alive: false`.
3. **Legacy v1 lock cannot be safely classified as stale.** `acquireWorkerLock` only reclaims stale heartbeat for v2 locks. A v1 lock with an alive PID and no poller is respected forever.
4. **Mutation tools have no degraded recovery path.** `adv_worktree_create` depends on project workflow availability and hard-blocks when the queue has no poller.

## Evidence Log

### 2026-05-04 — Issue cluster

- Three independent agents filed #22, #23, and #24 within minutes against the same PokeEdge project queue.
- All reported worker restart did not restore observable worker/poller health.
- #24 reports manual child-process killing caused child respawn, but still no parent-observed registration; OpenCode restart was the only successful recovery.

### 2026-05-04 — Cross-project health from Advance session

`adv_status target_path: /home/jrede/dev/pokeedge-web view: health` returned:

```text
Temporal: server alive ✓
Worker lock: pid=3011283 v1 heartbeat=unknown last=unknown
stale queue advance-67fe3e95bc2afb49e94cada183986fa1712e47d5 has 6 Running workflows older than 5 min with no local poller
```

Raw fields included:

```json
{
  "server_alive": true,
  "worker_alive": true,
  "worker_process_alive": true,
  "registered_queues": ["advance-bdf259aa162ae192af5b18899ccdc653b085528d"],
  "stale_queues": [{"queue":"advance-67fe3e95bc2afb49e94cada183986fa1712e47d5","running_count":6}],
  "worker_lock": {"holder_pid":3011283,"last_heartbeat_at":null,"heartbeat_age_ms":null,"schema_version":1}
}
```

Interpretation: from the Advance session, the local Advance worker is healthy, while the PokeEdge target queue is stale. Cross-project health mixes current-session worker registration with target-project stale queue details, so per-project diagnosis needs to run inside or explicitly target PokeEdge when available.

### 2026-05-04 — Temporal task queue / poller model clarification

Temporal's task queue poller list is **not** a durable worker registry. Official docs describe `task-queue describe` as showing Workers that have **recently polled**. Server-side poller entries are removed after roughly 5 minutes without a poll request; `LastAccessTime` older than roughly 1 minute can indicate shutdown or full worker capacity.

Implications for ADV:

- ADV should not rely on poller rows "sticking around" as durable ownership records.
- A healthy long-running Worker should continuously long-poll its Task Queue, so its poller entry should stay fresh while it is serviceable.
- A missing/stale poller is a **freshness/liveness signal**, not proof that no process exists.
- A file lock held by an alive OpenCode PID is a **host ownership signal**, not proof that a Temporal Worker is polling.
- Correct health needs three separate planes:
  1. host ownership lease (`worker.lock` + heartbeat),
  2. local worker process/IPC readiness,
  3. Temporal server-side queue serviceability (fresh poller and/or dispatch/backlog evidence).

Conclusion: the bug is not that Temporal workers should only live for 5 minutes. Workers are expected to run for the OpenCode session and keep polling. The bug is that ADV conflates ownership and process existence with queue serviceability, then treats restart initiation as success before any fresh poll/registration evidence exists.

### 2026-05-04 — Host process snapshot

`ps` shows the stale lock holder is alive, but has no `dist/temporal/worker.js` child:

```text
3011283    3874 Ssl+    06:20:16 opencode        opencode
3025253 3011283 Sl+     06:18:22 node            .../vscode-eslint/server/out/eslintServer.js --stdio
3026775 3011283 Sl+     06:18:12 node            .../yaml-language-server ... --stdio
```

Other OpenCode sessions do have `dist/temporal/worker.js` children, so worker child process existence is session-specific:

```text
2140348 2138950 Sl+ 01:27:05 node .../advance/plugin/dist/temporal/worker.js
2201225 1914036 Sl+ 01:24:16 node .../advance/plugin/dist/temporal/worker.js
2315241 1996980 Sl+ 01:09:00 node .../advance/plugin/dist/temporal/worker.js
2848661 2847502 Sl+ 00:39:24 node .../advance/plugin/dist/temporal/worker.js
3592214 2678396 Sl+ 00:05:44 node .../advance/plugin/dist/temporal/worker.js
```

Interpretation: the PokeEdge lock holder PID is alive but is not currently owning a visible Temporal worker child. Because its lock is v1, there is no heartbeat for automatic stale-lock reclaim.

## Code Findings So Far

### Restart tool returns before verification

`plugin/src/tools/temporal-ops.ts`:

```ts
restartCurrentProjectTemporalWorker(store.paths.root).catch((err) => {
  appendDebugLog("adv_temporal_worker_restart", ...);
});
return formatToolOutput({ success: true, message: "Worker restart initiated..." });
```

This confirms issues #22/#23/#24: the tool returns `success: true` for initiation, not verified worker registration.

### Restart implementation respects alive v1 lock

`plugin/src/plugin-init.ts` calls `acquireWorkerLock(projectStateDir)` before spawning a worker during restart.

`plugin/src/temporal/worker-lock.ts` only reclaims stale heartbeat when the lock is v2:

```ts
if (livenessState === "alive" && isStaleHeartbeat(contents)) {
  await safeRemove(lockPath);
  continue;
}
// alive OR unknown_owner → respect the lock.
return { owned: false, ownerPid: contents.pid, reason: "lock_held_by_alive_pid" };
```

`isStaleHeartbeat(contents)` returns `false` for v1 locks:

```ts
if (!isV2Lock(contents)) return false;
```

This explains the stuck state: v1 + alive PID + no poller cannot be auto-reclaimed.

### Health is parent in-memory registry, not Temporal server poller truth

`plugin/src/temporal/health-probe.ts` derives worker liveness from parent memory:

```ts
const registered_queues = getRegisteredTemporalWorkerQueues();
const worker_process_alive = getTemporalWorkerAliveness();
worker_alive: registered_queues.length > 0,
```

`plugin/src/plugin-init.ts` derives registered queues from `inProcessTemporalWorkers`, including OOP worker handles registered in parent memory:

```ts
for (const worker of inProcessTemporalWorkers) {
  for (const queue of worker.queues) queues.add(queue);
}
```

If the parent has no registered worker handle, health reports no worker even if another process exists on disk.

### Worktree create blocks before git worktree creation

`adv_worktree_create` calls `initStateDb(projectRoot)` before `advWorktreeCreate(...)`.

`initStateDb` calls `getBoundedProjectWorkflowAccess(...)` and throws when unavailable:

```ts
throw new Error(
  `initStateDb: project workflow unavailable for ${projectId}: ${access.reason}`,
);
```

`getBoundedProjectWorkflowAccess` checks only local parent worker registry for the expected queue:

```ts
const queues = getRegisteredTemporalWorkerQueues();
if (!getTemporalWorkerAliveness() || !queues.includes(expectedQueue)) {
  return { mode: "unavailable", reason: `Temporal worker not ready for queue ${expectedQueue}` };
}
```

This explains why worktree creation fails even before any filesystem worktree step: the registry has no PokeEdge queue poller.

### Multi-worker ready/registration IPC can desync after initial spawn

`plugin/src/temporal/worker-multi.ts` waits for `ready` only on initial spawn. On respawn after crash, it explicitly discards the ready promise:

```ts
// Respawn intentionally discards the ready promise — the existing MultiWorker handle stays live
void spawnChild().catch((err) => {
  debugLog(`respawn ready-handshake failed: ${err.message}`);
});
```

If respawn fails handshake or child starts without usable IPC, the existing handle can remain in parent memory until exhaustion or clearing. This aligns with #24's report of respawns that never restore observable readiness.

## Code Paths to Inspect

| Area | File | Current concern |
| --- | --- | --- |
| Restart tool | `plugin/src/tools/temporal-ops.ts` | `adv_temporal_worker_restart` returns success before verification. |
| Restart implementation | `plugin/src/plugin-init.ts` | `restartCurrentProjectTemporalWorker` acquires lock and creates worker, but async errors are hidden by the tool. |
| Lock acquisition | `plugin/src/temporal/worker-lock.ts` | v1 alive-PID lock has no heartbeat and is never reclaimed. |
| Health probe | `plugin/src/temporal/health-probe.ts` | `worker_alive` is derived from in-memory registered queues, not actual child process state. |
| OOP worker registry | TBD | Need trace child process startup, ready/registration IPC, and process aliveness reporting. |
| Worktree init | TBD | Need trace `adv_worktree_create` → project workflow reachability → worker readiness error. |
| Worktree init | `plugin/src/tools/adv-worktree.ts`, `plugin/src/tools/worktree/state.ts`, `plugin/src/tools/project-workflow-helper.ts` | `adv_worktree_create` hard-blocks on local parent worker registry missing the expected project queue. |

## Investigation Questions

1. Where are OOP workers registered in parent memory, and what event clears/updates `registered_queues`?
2. Can worker child processes be spawned without registration messages reaching the parent?
3. Does `restartCurrentProjectTemporalWorker` release/reclaim v1 locks when the holder PID is alive but no queue is registered?
4. Does `handleWorkerExhausted` downgrade lock schema or leave v1 locks behind?
5. How can diagnose distinguish these states?
   - lock held + poller alive
   - lock held + child alive + no registration
   - lock held + child missing + no registration
   - v1 alive-PID lock + no poller
6. Should `adv_worktree_create` attempt or await recovery, or only surface structured blocker data?

## Candidate Fix Directions

1. Make `adv_temporal_worker_restart` wait up to a bounded timeout for `registered_queues` to include the project queue; return structured failure otherwise.
2. Add approved force-reset path that clears worker lock and respawns from a clean slate when no poller is observed.
3. Treat v1 alive-PID locks with no registered queue/no poller as suspect and route to explicit recovery instead of restart loops.
4. Record restart attempts in Temporal/tool state so `adv_temporal_diagnose` can escalate after unchanged state.
5. Improve `adv_worktree_create` error output with worker lock holder, queue, stale workflow count, and next recovery action.
6. On OOP respawn, wait for ready/registration and mark worker dead with `last_worker_run_error` if ready never arrives; do not leave an apparently-live handle without a registered poller.
7. Distinguish local-session health from target-project health in cross-project `adv_status` so users do not misread `worker_alive:true` for the current ADV repo as target worker health.

### Corrected architecture direction after Temporal model review

The fix should target the worker ownership/recovery layer, not replace Temporal. Keep Temporal as durable workflow/task-queue backend, but harden ADV's integration around it:

1. Rename restart success semantics from "spawn initiated" to **queue serviceable**.
2. Verify serviceability using bounded evidence: expected queue registered locally, worker child/IPC ready, and fresh server-side poller/backlog signal when available.
3. Make `worker.lock` a renewable lease with heartbeat freshness; migrate or quarantine legacy v1 locks instead of respecting alive-PID-only locks forever.
4. Require explicit user approval before reclaiming a live PID's lock unless heartbeat/ownership rules prove stale.
5. Make `adv_worktree_create` call bounded recovery once, then fail with structured diagnostics instead of continuing a blind restart loop.
6. Keep dedicated external worker fleet as future option only if per-session workers cannot meet reliability goals; current incident does not yet prove Temporal itself is the wrong architecture.

## Next Evidence To Capture

- `adv_temporal_diagnose` from inside a broken PokeEdge session before and after restart.
- `ps` tree for `opencode` holder PID and any `dist/temporal/worker.js` children.
- Debug log entries from `adv_temporal_worker_restart` async catch.
- Code path for OOP worker ready/registration messages and aliveness registry.
- Tests that model v1 lock + alive PID + no registered queue.
