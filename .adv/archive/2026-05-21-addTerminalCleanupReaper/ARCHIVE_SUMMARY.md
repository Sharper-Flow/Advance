# Archive: Add terminal cleanup reaper

**Change ID:** addTerminalCleanupReaper
**Archived:** 2026-05-21T07:57:07.704Z
**Created:** 2026-05-21T04:43:14.881Z

## Tasks Completed

- ✅ T1: Add terminal cleanup reaper spec deltas and structural guard tests
  > Added four worktree-lifecycle spec-law requirements: rq-terminalCleanupReaper01, rq-terminalCleanupSafety01, rq-terminalCleanupVisibility01, rq-terminalCleanupLifecycle01. Added `plugin/src/__tests__/worktree-lifecycle-assets.test.ts` to assert requirement presence/content and guard against direct `git worktree remove` calls outside the existing removal primitive. Verified with `pnpm test -- src/__tests__/worktree-lifecycle-assets.test.ts`.
- ✅ T2: Extract shared pending-delete drain primitive
  > Extracted exported `drainPendingDeletes(trigger, deps, options)` shared primitive in `plugin/src/tools/worktree/index.ts`. It drains known pending deletes, respects automatic retry caps unless `forceAttempts` is set, preserves dry-run as non-mutating, uses the `AdvWorktreeDeleteDeps` bundle including `store`, delegates all removal attempts to `advWorktreeDelete`, clears successful entries, and increments retained failures. Routed `advWorktreeCleanup` and the plugin-local `processPendingDeletes` wrapper through this shared primitive. Added focused tests in `plugin/src/tools/worktree/index-delete.test.ts` for retry-cap behavior, dry-run non-mutation, and store-aware registry-drift cleanup. Also made the test helper use per-temp-repo pending-delete project IDs to avoid leaked external pending-delete state across tests.
- ✅ T3: Route startup and session.deleted cleanup through the shared store-aware path
  > Added bounded startup pending-delete drain to the legacy `WorktreePlugin`, reusing the shared `drainPendingDeletes` primitive and shared `warpDeps`. Routed the main ADV plugin through the same shared drain with durable `store` for both startup and `session.deleted`, before store close. Added startup test coverage in `plugin/src/tools/worktree/index-delete.test.ts` proving known pending deletes are retried on plugin startup. Startup/session.deleted use `forceAttempts: false`, so automatic triggers respect the retry cap and drain known pending deletes only.
- ✅ T4: Add full terminal cleanup discovery for manual/status/archive triggers
  > Added `discoverTerminalCleanupCandidates` in `plugin/src/tools/worktree/index.ts`. It scans git worktree facts, infers `change/*` owners, verifies terminal change state from the durable store (`archived` or `closed`), queues candidates with `setPendingDelete`, then lets the shared drain and `advWorktreeDelete` enforce merged/clean/live-CWD safety structurally. Manual `advWorktreeCleanup` now runs discovery before draining by default; startup/session.deleted still call `drainPendingDeletes` directly and therefore do not run full discovery. Wired best-effort status-triggered cleanup before worktree census in `plugin/src/tools/status.ts`, and archive-triggered cleanup after durable archive status transition in `plugin/src/tools/change.ts`. Added RED/GREEN test coverage for manual discovery of an archived change worktree with no existing pending-delete entry.
- ✅ T5: Surface retained terminal cleanup blockers in status and triage
  > Added shared pending-delete classification and aggregation helpers in `plugin/src/tools/worktree/state.ts`. `adv_status` now surfaces `terminal_cleanup_retained` as count/classes only, and formatted Worktrees output includes retained cleanup counts without paths. `adv_worktree_triage` now reports exact retained terminal cleanup pending-delete blockers with branch, path, reason, attempts, and remediation. Added tests in `plugin/src/tools/status.test.ts` and `plugin/src/tools/worktree/triage.test.ts`.
- ✅ T6: Preserve retry semantics and classify retained cleanup failures
  > Extended pending-delete records with optional `lastError` and `lastErrorClass` while preserving backwards compatibility for old JSON records. Added `recordPendingDeleteFailure` to atomically increment attempts and persist failure metadata. Updated the shared drain to record classified retained failures for in-use and failed delete attempts. Status aggregation now prefers `lastErrorClass` when present. Added tests for persisted retained failure metadata and exhausted-retry status aggregation behavior.
- ✅ T7: Final integration verification for terminal cleanup reaper
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Worktree pending-delete state is durable external project state, not temp-repo-local. Tests using a fixed WorktreeStateAccess.projectId can leak queued deletes/attempt counts across runs; use a unique projectId per temp fixture when asserting pending-delete behavior.
- **[convention]** Worktree cleanup recommendations should not suggest manual filesystem/git deletion for ADV worktrees; route operators through adv_worktree_delete so durable terminal-state, merged, clean, and live-CWD gates stay centralized.
