# Temporal Worker Stuck Recovery — Incident Summary

> **Status:** historical reference. Recovery model shipped by
> `fixStuckTemporalWorkerRecovery`. For live operations, use
> [`temporal-recovery.md`](./temporal-recovery.md).

## Scope

This document summarizes recovery class addressed by
`fixStuckTemporalWorkerRecovery`:

- [Opencode-Advance#22](https://github.com/Sharper-Flow/Opencode-Advance/issues/22) — `adv_worktree_create` blocked on stale Temporal poller rows.
- [Opencode-Advance#23](https://github.com/Sharper-Flow/Opencode-Advance/issues/23) — `adv_temporal_worker_restart` reported success with no live worker.
- [Opencode-Advance#24](https://github.com/Sharper-Flow/Opencode-Advance/issues/24) — wedged sessions left v1-schema `worker.lock` files alive without heartbeat.
- [Opencode-Advance#25](https://github.com/Sharper-Flow/Opencode-Advance/issues/25) — fresh v2 heartbeat acted as poison-pill when holder was not serving the queue.
- [Opencode-Advance#26](https://github.com/Sharper-Flow/Opencode-Advance/issues/26) — `checkpointRecorded:false` after git commit could be mistaken for task success.
- [Opencode-Advance#27](https://github.com/Sharper-Flow/Opencode-Advance/issues/27) — STSL reconnect guidance was conflated with worker-registration recovery.

## Shared Diagnostic Shape

Original #22/#23/#24 shape:

```text
server_alive: true
worker_alive: false
worker_process_alive: false
registered_queues: []
stale_queues: [{ queue: "advance-{projectId}", running_count: N }]
worker_lock.holder_pid: <alive opencode pid>
worker_lock.schema_version: 1
worker_lock.last_heartbeat_at: null
worker_lock.heartbeat_age_ms: null
```

Re-entry #25/#27 shape:

```text
server_alive: true
worker_alive: false
registered_queues: []
worker_lock.schema_version: 2
worker_lock.heartbeat_age_ms: <fresh>
queue_serviceability.status: "not_serviceable"
```

The key distinction: lock/process liveness is not queue serviceability.

## What Was Wrong

1. **Restart was fire-and-forget.** `adv_temporal_worker_restart` returned
   `success: true` after initiating restart, before expected queue registration
   or fresh poller proof.
2. **Singleton lock fallback over-protected suspect owners.** v1 alive-PID locks
   were respected forever, even when no worker served the queue.
3. **Fresh v2 heartbeat was over-trusted.** A renewing lock proved holder
   process liveness, not task queue serviceability.
4. **Worktree creation recovered too late.** Existing worktrees could be missed
   while tool startup blocked on project workflow recovery.
5. **Checkpoint ledger failures were too easy to misread.** Git commit success
   with `checkpointRecorded:false` still required ledger recovery before task
   completion.
6. **Reconnect guidance was too broad.** `adv_temporal_reconnect` repairs
   STSL/client state only; it cannot make a worker poll a queue.

## What Changed

### Spec Laws

- `rq-toolTimeoutOverride01.2` — bounded verified worker recovery replaces
  fire-and-forget restart.
- `rq-workerSingleton01` / `.2` / `.6` — suspect live locks require explicit
  approval to reclaim unless dead/stale rules prove safety.
- `rq-workerHealth01` — queue serviceability diagnostics and recovery guidance.
- `rq-worktreeReuse01` — existing change worktrees are reused before workflow
  recovery or `git worktree add`.
- `rq-checkpointLedger01` — `checkpointRecorded:false` blocks task completion.

### Runtime Recovery

- `temporal/queue-serviceability.ts` classifies queue state from local owner
  evidence, server poller probe, stale workflow count, and ownership.
- `adv_temporal_worker_restart` waits for queue serviceability proof within a
  bounded budget and returns structured failure evidence otherwise.
- Live unserviceable v1/v2 lock reclaim requires `approvedLockReclaim` plus
  `approvalEvidence`; dead PID and stale v2 heartbeat remain automatic paths.
- Heartbeat writer stops renewing when local worker serviceability remains false
  past grace.

### Diagnostics and Guidance

- `adv_temporal_diagnose`, `adv_status`, and project-workflow recovery now expose
  queue serviceability snapshots and distinguish self-owned, peer-owned,
  serviceable, and suspect locks.
- Worker-registration failures recommend verified worker recovery, owner session
  restart, or approval-gated reclaim — not STSL reconnect.
- `adv_temporal_reconnect` remains STSL/client-only.

### Worktree and Ledger Safety

- `adv_worktree_create` uses `git worktree list --porcelain` first. Existing
  branch/path reuse avoids workflow recovery, base resolution, flock, and
  `git worktree add`; missing paths run `git worktree prune` before fresh create.
- `adv_task_checkpoint` surfaces clean-tree and dirty-commit ledger failures as
  `checkpointRecorded:false` with remediation. `/adv-apply` must run
  `adv_task_show` and recover checkpoint ledger state before marking done.

## Recovery Ladder

Use [`temporal-recovery.md`](./temporal-recovery.md) for active steps. Summary:

1. Run `adv_temporal_diagnose`.
2. If server/search attributes/STSL are unhealthy, repair that plane first.
3. If expected queue is not serviceable and lock is suspect live v1/v2:
   - restart owning OpenCode session, or
   - rerun `adv_temporal_worker_restart` with explicit approval evidence.
4. If no suspect live lock blocks recovery, `adv_temporal_worker_restart` performs
   verified recovery.
5. For workflow-state corruption, use `adv_workflow_repair` with approval; for
   disk-only orphan workflows, use `adv_orphan_sweep`.

## Source-vs-Dist Caveat

OpenCode loads the plugin from `plugin/dist/index.js` at session startup. Source
tests validate `plugin/src/**`, but live tool behavior requires `pnpm run build`
and a fresh OpenCode session to load changed dist code. If
`plugin/src/temporal/*` changed, rebuild worker dist before expecting spawned
workers to use new code.
