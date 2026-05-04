# Design update — GitHub #25/#26/#27 + agent/worktree recovery failure

## Scope delta

GitHub #25, #26, #27, and the transcript show three coupled failure planes:

1. **Worker ownership poison pill** — a lock holder can keep `worker.lock.last_heartbeat` fresh while not polling the expected project queue.
2. **False-positive restart/reconnect recovery** — `adv_temporal_worker_restart` can report success even though no poller registers and `registered_queues: []` remains; follow-up `adv_temporal_reconnect` can still fail with `Temporal worker not ready ... no registered worker`.
3. **Agent orchestration blind spot** — when `adv_worktree_create` / `adv_run_test` / `adv_task_update` are blocked by the stuck worker, agents keep trying worker/tool recovery instead of first detecting/reusing the existing `change/<id>` git worktree and using local verification safely.

The practical failure was not only Temporal. It was: dirty main checkout → agent tried to create worktree → ADV worker blocked the tool → agent diagnosed/restarted worker and spawned mechanic → user had to say “switch to the right worktree” → existing worktree was found and local tests/checkpoint could proceed, but durable ADV evidence/ledger remained blocked.

## Revised health/worktree model

ADV must treat these as independent planes:

1. **Git/worktree plane** — existing `git worktree list --porcelain` state is authoritative even when ADV Temporal tools are blocked.
2. **Temporal server/STSL plane** — backend reachable and client initialized.
3. **Host ownership lease plane** — `worker.lock` holder PID/worker_id/heartbeat identity.
4. **Local worker readiness plane** — current process has expected queue registered/alive.
5. **Queue serviceability plane** — expected queue proven serviceable by local readiness and/or fresh server poller evidence.
6. **ADV ledger plane** — task evidence/checkpoint/status updates are durable only when Temporal workflow updates record them; a git commit without checkpoint ledger recording is not task completion.

Only plane 5 proves ADV mutations can make progress. Plane 1 can still allow safe local code/test work when evidence/checkpoint tools are blocked. Plane 6 gates task completion.

## Policy changes

### Verified restart/reconnect

`adv_temporal_worker_restart` success means the expected project queue became serviceable within the bounded verification budget. If no poller/register evidence appears, the tool returns `success:false` with diagnostics. It must never return a generic “restart initiated” success for #26/#27.

`adv_temporal_reconnect` must not be recommended as a worker-registration fix when queue serviceability is negative. Reconnect can repair STSL connection state; it cannot prove or create a poller.

### Worktree selection before creation

Before any mutating implementation task, agent/tooling must:

1. Inspect `git worktree list --porcelain` for `branch refs/heads/change/<change-id>`.
2. If found, set the returned path as effective workdir for **all** file/read/search/bash/test calls.
3. Only call `adv_worktree_create` when no matching worktree exists.
4. If main checkout is dirty and matching worktree exists, do not attempt to create a new worktree; switch to existing worktree.

This fallback must not depend on ADV worker availability because `git worktree list` is filesystem/git state.

### Tool-blocked fallback during apply

If ADV evidence/checkpoint/status tools are blocked by Temporal worker unserviceability:

- Do not switch to in-place edits on main.
- Do not immediately spawn mechanic before checking existing worktree and local verification.
- Run the same verification command locally in the correct worktree for diagnosis/progress.
- If `adv_task_checkpoint` creates a git commit but returns `checkpointRecorded:false`, the task is **not done**. The agent must retry/recover the ledger recording before `adv_task_update status:done`, or stop with structured `[ADV:BLOCKED]` containing:
  - worktree path
  - commit SHA
  - verification output
  - missing ledger event / retry instruction
  - worker diagnostics
- Durable evidence/checkpoint must be attached once worker recovers.

### Heartbeat behavior — #25 core fix

The lock owner must stop refreshing heartbeat when its own local worker is not serviceable for a bounded grace window.

Implementation details:

- Add local-only heartbeat guard to `startHeartbeatWriter`, e.g. `isServiceable?: () => boolean` plus `serviceabilityGraceMs?: number`.
- Guard uses local state only: expected queue present in owned worker `queues`, not in `failedQueues`, and worker alive (`isAlive()` for OOP if available).
- No `DescribeTaskQueue` or server task-queue probes from plugin init / heartbeat ticks.
- Default grace: `ADV_WORKER_HEARTBEAT_SERVICEABILITY_GRACE_MS`, effective minimum `max(30_000, HEARTBEAT_INTERVAL_MS * 3)`.
- Tick behavior:
  - serviceable → write heartbeat and reset `lastServiceableAt`
  - unserviceable within grace → skip heartbeat and schedule next tick
  - unserviceable beyond grace → stop writer and invoke existing exhaustion/release path

### Recovery / takeover

- Automatic reclaim: dead PID or stale v2 heartbeat only.
- Explicit approval-gated live-lock reclaim: any live `unserviceable_live_lock` (v1 or v2) after negative/unknown serviceability.
- Approval-gated reclaim is not normal plugin init; only explicit recovery tool path.
- Approved reclaim records prior PID, worker_id, schema version, heartbeat age, expected queue, serviceability evidence, and approval evidence.
- Healthy peer locks with fresh server poller evidence are never reclaimed.

### Diagnostics

`adv_temporal_diagnose`, `adv_status view:health`, worktree failures, and checkpoint ledger failures must surface:

- expected project queue
- queue serviceability status/confidence/blockers
- `worker_lock_held_by_self: true|false|null`
- worker lock PID/schema/heartbeat age
- local worker diagnostics
- server poller probe status
- stale running workflow count/probe status
- matching existing worktree path for `change/<id>` if relevant
- checkpoint commit SHA and `checkpointRecorded:false` if git commit succeeded but ledger failed
- recommended next action:
  - switch to existing worktree when present
  - wait for heartbeat to stale / approval-gated reclaim / owner restart for peer-owned unserviceable live lock
  - retry blocked ADV mutation tool after local verification
  - retry ledger recording before marking task done when checkpoint ledger failed

## Implementation impact

Completed tasks remain valid but need extension:

- queue serviceability helper
- local worker diagnostics
- verified restart shell
- diagnose/status queue serviceability fields

New/revised tasks required before continuing implementation:

1. Amend specs for:
   - false-positive restart forbidden (#26/#27)
   - reconnect is not worker-registration recovery when serviceability is negative (#27)
   - fresh heartbeat is host-liveness only (#25)
   - heartbeat suppression for self-owned unserviceable worker
   - live unserviceable lock reclaim is approval-gated for v1/v2
   - worktree detection/reuse before creation
   - tool-blocked local verification fallback
   - checkpointRecorded:false blocks task completion / ledger retry required
   - `worker_lock_held_by_self` diagnostic
2. Extend heartbeat/restart/lock diagnostics:
   - local-only heartbeat serviceability guard + grace
   - approval-gated live-lock reclaim for v1/v2 after negative/unknown serviceability
   - self/peer lock-holder identity
3. Extend project-workflow/worktree access recovery:
   - use existing git worktree path before create when worker blocked
   - surface worktree path + queue diagnostics in failures
   - no in-place fallback
4. Extend checkpoint/evidence recovery semantics:
   - expose ledger-write failure as retryable and task-blocking
   - preserve commit SHA/verification in output so retry can reconcile without duplicate work
5. Final regression must model #22/#23/#24/#25/#26/#27 + transcript shape:
   - main dirty
   - existing change worktree present
   - ADV worker not serviceable / worktree create blocked
   - restart cannot falsely succeed without poller/serviceability
   - reconnect is not suggested as sufficient worker-registration fix
   - local verification/checkpoint commit can happen in worktree
   - checkpoint ledger failure blocks task done until recorded/retried

## Deployment caveat

Source edits under `plugin/src/` do not affect already-running OpenCode sessions until build/fresh session. Upgraded sessions can self-starve and return verified restart results; old lock holders may still require approval-gated reclaim or owner restart.

## Non-goals

- No blind automatic live-PID kill.
- No manual lock-file deletion flow.
- No server-side task-queue probes during normal plugin initialization or heartbeat ticks.
- No in-place edits in dirty main checkout as fallback.
- No task completion when checkpoint/evidence ledger recording failed.
- No reclaim of a healthy peer lock with fresh poller evidence.
