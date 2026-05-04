# terminateChangeWorkflowOnArchive

## Why
After /adv-archive Phase 9 completes, the corresponding adv/change/{projectId}/{changeId} workflow continues to run indefinitely. The workflow's only exit path is continue-as-new on history rotation (plugin/src/temporal/workflows.ts:787-790). Archive activity does not signal or terminate the workflow. Every archived change becomes a permanent Running zombie on the project's queue.

Today's host: 47 zombies on this project, 200+ system-wide. The 2026-04-23 incident reached 5,447 before manual cleanup. Same trajectory.

## What Changes
- Add a terminal exit condition to changeWorkflow so it returns when the change reaches a terminal state (archived or closed).
- Wire archive activity (or post-archive signal) to drive the workflow into that terminal state deterministically.
- Possibly: update adv_change_close path symmetrically so closed changes also terminate their workflow.

Investigation in /adv-discover will determine the exact mechanism (signal vs state-driven wf.condition branch vs activity-side handle.terminate after bundle commit). Decision deferred to /adv-design.

## Success Criteria
- [ ] After adv_change_archive succeeds, the corresponding change workflow reaches Completed (or Terminated) in Temporal
- [ ] temporal workflow list with WorkflowType=changeWorkflow returns only workflows for changes still on disk
- [ ] adv_status no longer reports stale_queues entries when registered queues match disk-active changes
- [ ] Continue-as-new history rotation path unchanged (existing tests pass)
- [ ] workflow-bundle-boundary.test.ts still passes
- [ ] All tests pass (pnpm test) and pnpm run check is clean

## Affected Code
- plugin/src/temporal/workflows.ts — changeWorkflow exit condition (around line 787)
- plugin/src/temporal/activities.ts — possibly add a terminate-workflow activity
- plugin/src/archive/index.ts (and/or archive.ts) — invoke termination after bundle commit
- plugin/src/storage/store-temporal/index.ts — possibly add a terminateChangeWorkflow storage helper
- New tests covering: archive-then-workflow-terminated, idempotent re-archive, replay determinism

## Constraints
- Workflow code is webpack-bundled; workflow-bundle-boundary.test.ts MUST continue to pass
- Termination must be idempotent (archive can be re-run after partial failure)
- Must not break replay determinism — termination must occur via deterministic event sequence
- No node:* external imports introduced into the workflow bundle

## Impact
- Operator: stops zombie accumulation; adv_status becomes signal instead of noise
- ADV state: no schema migration — existing zombies remain (separate cleanup change handles them)
- Public ADV tools: behavior unchanged from caller's perspective

## Risks
- Race between archive-bundle commit and workflow termination → idempotency requirement
- Terminating mid-replay or during continue-as-new transition → must use deterministic state-driven exit
- adv_change_reenter on a terminated workflow → ensure re-create path works

## Validation Plan
TDD red→green per task:
- Red: Unit test: archive a change, query workflow status → expect Completed/Terminated. Fails on current main.
- Green: Implement exit condition + archive-time termination wiring → test passes.
- Refactor: Ensure history-rotation continue-as-new path unaffected; replay determinism test passes.
- Integration: workflow-bundle-boundary.test.ts, full vitest suite, pnpm run check.

## Investigation notes (for /adv-discover)
- Read archive bundle 2026-04-27-fixArchiveBookkeepingZombieBug — regression or distinct leak?
- Inspect wf.condition semantics: deterministic multi-branch resolution
- Examine 2026-04-22-archiveReleaseHygiene and 2026-04-10-fixRetiredWorkflowDrift archives

## Citations
- plugin/src/temporal/workflows.ts:787-790 — change workflow exit condition (history-only)
- plugin/src/archive/index.ts — archive orchestrator (no terminate call)
- plugin/src/temporal/activities.ts:427 — only existing terminate() is for project workflow rebuild
- docs/temporal-recovery.md § Stale adv/change/* and adv/project/* workflows — operator runbook
- 2026-04-23 incident: 5,447 zombies, manual cleanup