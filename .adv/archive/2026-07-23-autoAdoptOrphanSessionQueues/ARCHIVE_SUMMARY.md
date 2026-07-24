# Archive: Auto-adopt orphan session queues

**Change ID:** autoAdoptOrphanSessionQueues
**Archived:** 2026-07-23T23:44:43.570Z
**Created:** 2026-07-22T04:12:10.161Z

## Tasks Completed

- ✅ Implement `plugin/src/temporal/list-orphan-session-queues.ts` pure helper.
  > Task checkpoint completed
- ✅ Add spec delta `rq-isolSessionTaskQueue05` under capability `advance-workflow` via `adv_delta_add`. Captures the bootstrap's behavioral commitment as spec law; gets applied to `.adv/specs/advance-workflow/spec.json` at archive time.
  > Task checkpoint completed
- ✅ Implement `plugin/src/temporal/orphan-queue-adopter.ts` coordinator.
  > Task checkpoint completed
- ✅ Wire `OrphanQueueAdopter` into `plugin/src/plugin-init.ts` heartbeat `onBeat` callback. Phase B (env-flag-gated, default off).
  > Task checkpoint completed
- ✅ Extend `getTemporalWorkerDiagnostics` (in `plugin/src/plugin-init.ts`) + `adv_temporal_diagnose` renderer + `adv_status view:health` renderer to surface adoption state.
  > Task checkpoint completed
- ✅ End-to-end integration test + flip `ADV_ORPHAN_QUEUE_ADOPTION` default to `1` (Phase C enablement).
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 1 delta(s)

## Wisdom Accumulated

- **[gotcha]** Worktree-isolation guard reads the durable worktree record from the CHANGE workflow's `state.worktrees[branch]` map (state.ts:1124-1170 getWorktreeRecord → getStateQuery), NOT the project workflow. So if that map loses its entry, EVERY main-checkout (trunk/zlauncher) mutation for that change is blocked with WorktreeIsolationViolation — while other changes work fine. Two ways the map goes empty: (1) the change workflow is orphaned/unreachable (query fails → getWorktreeRecord returns null); (2) a state-repair restart seeds a fresh run WITHOUT the worktrees map. BUG (fixWorktreeReuseRegistration): advWorktreeCreate Step 0 (index.ts:1002-1017) reuses an on-disk git worktree and returns reused:true WITHOUT firing worktreeCreatedSignal (index.ts:1213) — so resume/create can never self-heal a missing worktrees entry when the disk worktree already exists. Manual recovery that works: `git worktree remove --force <path>` then `adv_worktree_create` (full path fires worktreeCreatedSignal, writes worktrees[branch] setupReady:true) → guard passes. Also: the `[worktree] mode:warp unavailable ... falling back to mode:terminal` log is NORMAL when OPENCODE_EXPERIMENTAL_WORKSPACES is off — it fires on every create/resume for every session and is NOT the blocker. When restarting an orphaned change workflow via the Temporal SDK, ALWAYS include `worktrees` in seedState.
