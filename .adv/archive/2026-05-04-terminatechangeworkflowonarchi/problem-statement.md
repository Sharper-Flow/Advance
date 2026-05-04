Change workflows in `plugin/src/temporal/workflows.ts` only exit via continue-as-new on history threshold (line 787-790). Archive flow (`plugin/src/archive/`) does not call `handle.terminate()` on the change workflow after the bundle is committed. Result: every archived change leaves a permanent `Running` workflow on the project's task queue.

Current state: 47 Running change workflows on this project's queue, 200+ system-wide. Only 3 changes are active on disk. The 2026-04-23 incident in `docs/temporal-recovery.md` reached 5,447 zombies before manual cleanup. Today's trajectory matches.

Cost is low (suspended `wf.condition`, no CPU), but operator-visible noise is high: every `adv_status` call surfaces stale-queue warnings, `temporal workflow list` is dominated by zombies, queue-serviceability probes report degraded health.

Possible regression of `2026-04-27-fixArchiveBookkeepingZombieBug` archive — investigate whether that change addressed this exact path or a different bookkeeping leak.</parameter>
<parameter name="proposal"># terminateChangeWorkflowOnArchive

## Why
After `/adv-archive` Phase 9 completes, the corresponding `adv/change/{projectId}/{changeId}` workflow continues to run indefinitely. The workflow's only exit path is continue-as-new on history rotation (`plugin/src/temporal/workflows.ts:787-790`). Archive activity does not signal or terminate the workflow. Every archived change becomes a permanent `Running` zombie on the project's queue.

Today's host: 47 zombies on this project, 200+ system-wide. The 2026-04-23 incident reached 5,447 before manual cleanup. Same trajectory.

## What Changes
- Add a terminal exit condition to `changeWorkflow` so it returns when the change reaches a terminal state (`archived` or `closed`).
- Wire archive activity (or post-archive signal) to drive the workflow into that terminal state deterministically.
- Possibly: update `adv_change_close` path symmetrically so `closed` changes also terminate their workflow (today, closed changes likely leak too).

Investigation in `/adv-discover` will determine the exact mechanism (signal vs state-driven `wf.condition` branch vs activity-side `handle.terminate()` after bundle commit). Decision deferred to `/adv-design`.

## Success Criteria
- [ ] After `adv_change_archive` succeeds for a change, the corresponding change workflow reaches `Completed` (or `Terminated`) in Temporal
- [ ] `temporal workflow list --query "ExecutionStatus='Running' AND WorkflowType='changeWorkflow'"` returns only workflows for changes still on disk in `changes/`
- [ ] `adv_status` no longer reports `stale_queues` entries when registered queues match disk-active changes
- [ ] Continue-as-new history rotation path unchanged (existing tests pass)
- [ ] `workflow-bundle-boundary.test.ts` still passes (no new external imports reachable from the workflow bundle)
- [ ] All tests pass (`pnpm test`) and `pnpm run check` is clean

## Affected Code
- `plugin/src/temporal/workflows.ts` — `changeWorkflow` exit condition (around line 787)
- `plugin/src/temporal/activities.ts` — possibly add a terminate-workflow activity (or reuse existing `projectHandle.terminate` pattern at line 427)
- `plugin/src/archive/index.ts` (and/or `plugin/src/archive/archive.ts`) — invoke termination after bundle commit
- `plugin/src/storage/store-temporal/index.ts` — possibly add a `terminateChangeWorkflow` storage helper
- New tests covering: archive-then-workflow-terminated, idempotent re-archive, replay determinism

## Constraints
- Workflow code is webpack-bundled and reachable from `plugin/src/temporal/workflows.ts` only — `workflow-bundle-boundary.test.ts` MUST continue to pass
- Termination must be idempotent (archive can be re-run after partial failure)
- Must not break replay determinism — termination must occur via deterministic event sequence (not wall-clock branch)
- No `node:*` external imports introduced into the workflow bundle

## Impact
- Operator: stops zombie accumulation; `adv_status` becomes signal instead of noise; `temporal workflow list` is again useful for diagnosis
- ADV state: no schema migration — existing archived changes' Running workflows remain (cleanup handled by separate change `cleanupZombieRunningWorkflows`)
- Public ADV tools: behavior unchanged from caller's perspective

## Risks
- Race between archive-bundle commit and workflow termination → re-archive must remain safe (idempotency requirement)
- Terminating mid-replay or during continue-as-new transition → must use deterministic state-driven exit, not async signal that races with `wf.condition`
- Termination too aggressive: a closed-but-not-archived change reopening via `adv_change_reenter` might find no workflow to update → ensure `adv_change_reenter` re-creates the workflow if absent

## Validation Plan
TDD red→green per task:
- **Red:** Unit test: archive a change, query workflow status → expect `Completed`/`Terminated`. Test fails with current main (workflow stays Running).
- **Green:** Implement exit condition + archive-time termination wiring → test passes.
- **Refactor:** Ensure history-rotation continue-as-new path unaffected; replay determinism test passes.
- **Integration:** `workflow-bundle-boundary.test.ts`, full vitest suite (3119+ tests), `pnpm run check`.

## Investigation notes (for /adv-discover)
- Read archive bundle `2026-04-27-fixArchiveBookkeepingZombieBug` first — determine whether this is a regression of that fix or a distinct leak path
- Inspect `wf.condition` semantics: can a `wf.condition` resolve on multiple branches deterministically?
- Examine `2026-04-22-archiveReleaseHygiene` and `2026-04-10-fixRetiredWorkflowDrift` archives for prior context

## Citations
- `plugin/src/temporal/workflows.ts:787-790` — change workflow exit condition (history-only)
- `plugin/src/archive/index.ts` — archive orchestrator (no terminate call)
- `plugin/src/temporal/activities.ts:427` — only existing `terminate()` is for project workflow rebuild
- `docs/temporal-recovery.md` § "Stale `adv/change/*` and `adv/project/*` workflows" — operator runbook
- 2026-04-23 incident reference (5,447 zombies, manual cleanup)