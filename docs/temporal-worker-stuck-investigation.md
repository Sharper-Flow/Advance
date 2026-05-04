# Temporal Worker Stuck Recovery — Incident Summary

> **Status:** historical reference. The recovery model described here is shipping
> as of `fixStuckTemporalWorkerRecovery`. For the active runbook, see
> [`temporal-recovery.md`](./temporal-recovery.md).

## Scope

This document summarizes the cross-issue recovery class addressed by the
`fixStuckTemporalWorkerRecovery` change:

- [Opencode-Advance#22](https://github.com/Sharper-Flow/Opencode-Advance/issues/22) — `adv_worktree_create` blocked on stale Temporal poller rows
- [Opencode-Advance#23](https://github.com/Sharper-Flow/Opencode-Advance/issues/23) — `adv_temporal_worker_restart` reported success with no live worker
- [Opencode-Advance#24](https://github.com/Sharper-Flow/Opencode-Advance/issues/24) — wedged sessions left v1-schema `worker.lock` files alive without heartbeat

All three share the same incident shape:

- Temporal **server alive**.
- Expected project queue **not serviceable** — no fresh poller, no local
  worker registration.
- `worker.lock` present with **alive `holder_pid`**, **schema_version: 1**,
  **no `last_heartbeat_at`**.
- `adv_change_list ExecutionStatus="Running"` shows tens to thousands of
  workflows on the queue.
- ADV worktree creation, agenda updates, and other workflow-backed mutations
  fail with `Temporal worker not ready for queue advance-{projectId}`.

## What was wrong

Three reinforcing bugs:

1. **`adv_temporal_worker_restart` was fire-and-forget.** It spawned a worker
   then returned immediately, with no proof that the new worker actually
   serviced the queue. Operators saw `success: true` even when the spawn
   silently failed (e.g. lock-held, registration error).
2. **Singleton lock fallback was over-protective.** The v1-schema fallback
   protected any alive PID, including suspected wedged owners with no
   heartbeat evidence. Recovery loops never made progress because each
   restart respected the suspect lock.
3. **Worktree creation had no project-workflow recovery seam.** When the
   workflow access helper returned `unavailable`, callers either failed or
   silently degraded to in-place behavior — bypassing the project workflow
   without operator awareness.

## What changed

The change ships four planes of fix:

1. **Spec laws** (advance-meta):
   - `rq-toolTimeoutOverride01.2` — bounded verified recovery instead of
     fire-and-forget restart.
   - `rq-workerSingleton01` + `.2` — v1 alive-PID fallback now protects only
     passive initialization and known-serviceable owners; suspect recovery
     states require explicit approval.
   - `rq-workerSingleton01.6` — suspect legacy live lock requires approval to
     reclaim.
   - `rq-workerHealth01` — queue serviceability diagnostics scenario.

2. **Runtime serviceability classifier** (`temporal/queue-serviceability.ts`):
   - Typed `QueueServiceability` result combining local owner evidence,
     server poller probe (`describeTaskQueue`), stale workflow count, and
     ownership.
   - Status: `serviceable` / `not_serviceable` / `unknown`; never collapses
     unavailable probes to healthy empty.

3. **Worker recovery surfaces:**
   - `adv_temporal_worker_restart` now awaits queue serviceability proof
     within a 10 s budget, surfaces a structured failure envelope, and
     accepts `approvedLockReclaim` + `approvalEvidence` for suspect live v1
     lock reclaim.
   - `getBoundedProjectWorkflowAccess` accepts `recovery: "once"` for hot-path
     callers; runs one bounded non-approval restart attempt and re-checks
     readiness, returning rich diagnostics on failure (never recommending
     in-place fallback).
   - `adv_temporal_diagnose` and `adv_status` health output now include the
     `queueServiceability` snapshot and route the recovery recommendation
     through suspect-lock detection before stale-queue/orphan-sweep guidance.

4. **Worktree creation seam:**
   - `tools/worktree/state.ts` resolves project-workflow access with
     `recovery: "once"`, so `adv_worktree_create` either reaches
     workflow-backed access after one verified recovery or fails with
     actionable diagnostics. Migration / wisdom / agenda paths preserve the
     historical no-recovery behavior.

## Recovery ladder (final)

For the live runbook, follow [`temporal-recovery.md`](./temporal-recovery.md).
The high-level sequence:

1. `adv_temporal_diagnose` — establish server / search-attribute / STSL /
   worker / serviceability state.
2. If serviceability is `not_serviceable` and lock is suspect v1:
   - Restart the owning OpenCode session (preferred), or
   - `adv_temporal_worker_restart approvedLockReclaim: true approvalEvidence: "..."`.
3. Otherwise, `adv_temporal_worker_restart` performs verified recovery.
4. For workflow-state corruption, `adv_workflow_repair` with explicit
   approval; for disk-only orphan workflows, `adv_orphan_sweep`.

## Source-vs-dist caveat

`adv_temporal_worker_restart` does not reload host-loaded plugin tool code in
`plugin/src/tools/*.ts`. If those files changed, restart OpenCode. If
`plugin/src/temporal/*` changed, run `pnpm run build:worker` in `plugin/`
before restart so the worker loads the new bundle from `dist/temporal/`.
