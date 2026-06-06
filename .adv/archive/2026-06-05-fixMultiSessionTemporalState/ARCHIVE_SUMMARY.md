# Archive: Fix multi-session Temporal state coordination

**Change ID:** fixMultiSessionTemporalState
**Archived:** 2026-06-05T19:55:48.739Z
**Created:** 2026-06-05T16:20:46.492Z

## Tasks Completed

- ✅ ## Fix 1: Server-side worker_alive via probeTaskQueuePollers
  > Task checkpoint completed
- ✅ ## Fix 2: Memo busting via archive-bundle check
  > Added listResolvedChanges memo pre-scan that invalidates non-terminal memo/cache entries when a durable archive bundle exists, ensuring subsequent list hydration observes archived terminal state across sessions. Added regression tests for stale non-terminal memo busting, terminal memo no-op behavior, and bounded pre-scan latency.
- ✅ ## Fix 4: Triage sub-classification via branch reachability
  > Added `missing_from_temporal_unmerged` orphan class. Triage now checks unregistered `change/*` worktrees for proven unmerged commits ahead of the detected default branch via git refs/rev-list. Proven-unmerged branches get resume/merge guidance without deletion guidance; unknown or merged reachability preserves the existing `missing_from_temporal` behavior. Added RED/GREEN regression test for unregistered worktree with an unmerged commit.
- ✅ ## Fix 3: Async phase9 via background queue + workflow state
  > Added async Phase 9 finalization queue path for explicit `phase9:"run"`: archive writes bundle synchronously, records `phase9_status: pending` in change workflow state, dispatches git finalization/release-gate/durable-proof/archive retirement asynchronously, and records done/failed status through workflow-backed phase9 status signal. Added `phase9_status` schema/readback on Change so `adv_change_show` surfaces progress. Preserved `phase9:"skip"` and dry-run behavior. Regenerated public schema. Note: formatting check caused Prettier-only formatting updates in several touched/checked source files.
- ✅ ## Validation: Full test suite + constraints check
  > Ran full and smoke validation. Fixed validation blockers found by full suite: updated Temporal message surface tests for the new phase9StatusUpdated signal, restored missing `rq-worktreeTargetCleanup01` id in worktree-lifecycle spec JSON, and added structural preflight validation requiring recoveryEvidence when task mutation tools use recoveryMode='poisoned_history'. Final verification: `bin/oc-test full` passed and `bin/oc-test smoke` passed.
- ✅ ## Fix 5: Guard loadValidationContext per-peer hydration loop
  > Wrapped the loadValidationContext per-peer `store.changes.get` in try/catch. A peer change whose Temporal workflow was evicted/terminated (disk projection may survive) makes getTemporalChange throw WorkflowNotFoundError; the guard now skips that peer (capabilities stay []) and logs a warning, so adv_change_validate and adv_change_archive no longer crash for a healthy change. Added two regression tests (validate + archive dryRun) reproducing the dangling-peer crash. Does not suppress target-change validation errors (C5). Mirrors listResolvedChanges tolerance.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For file-scoped Vitest verification in this repo, `pnpm test -- <file>` can run broader suite under current pnpm/script routing. Use `pnpm exec vitest run <file>` for precise targeted evidence.
- **[pattern]** For worktree orphan subclasses, prove stronger states structurally and preserve legacy classification on unknowns. Here `rev-parse` both refs + `rev-list default..branch` gives positive evidence for unmerged commits; any failure falls back to `missing_from_temporal` instead of guessing.
- **[gotcha]** Workflow-backed ADV fields must be updated through workflow signals, not `store.changes.save` on active changes. In Temporal store, non-archived `changes.save` writes legacy projection only; `adv_change_show` reads workflow state via `mapTemporalChangeStateToChange`.
- **[gotcha]** Multi-session orphan blast radius: in the Temporal store, `store.changes.get` (getTemporalChange) THROWS WorkflowNotFoundError when a change's workflow is evicted/terminated and disk re-seed fails. `listResolvedChanges` wraps per-change loads in try/catch, but secondary per-peer hydration loops (e.g. `loadValidationContext` reading each active peer's deltas for conflict detection) were unguarded — so one dangling peer crashed adv_change_validate AND adv_change_archive for every healthy change. Lesson: any loop that calls `store.changes.get` across the active-change set must tolerate a throwing peer (skip + log), not just the list path. A dangling peer has no recoverable deltas, so skipping it is correct for conflict detection.
