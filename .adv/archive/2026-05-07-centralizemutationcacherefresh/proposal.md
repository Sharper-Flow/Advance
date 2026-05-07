# centralizeMutationCacheRefresh

## Intent

Centralize the cache-refresh-after-fireSignal discipline so tool-layer code paths can fire workflow signals without manually orchestrating cache invalidation. Eliminate the silent-stale-read class of bugs that the gate-path fix (`4a3e81f`) only partially addressed.

## Scope

### In Scope
- Audit of the ~19 `fireSignal(handle, ...)` direct call sites in `plugin/src/tools/`
- Centralization of the refresh discipline (one of two design directions, see below)
- Migration of all affected call sites to the centralized pattern
- Regression tests pinning the cache-refresh contract for every signal-firing tool
- Update of related fix `4a3e81f` to use the new centralized pattern (so all paths share one mechanism)
- Documentation update in AGENTS.md (or relevant rules) so future tool authors don't reintroduce the bug

### Out of Scope
- Refactoring `fireSignal` itself (the adapter that talks to Temporal) beyond what's needed for refresh integration
- Workflow-layer changes (this is purely a client-side / store-layer fix)
- New tool features or behavioral changes — semantics-preserving refactor only
- Replacing the in-memory `changeCache` with a different cache implementation
- The unrelated `adv_status` visibility memo issue (#57) which has a different root cause

## Two design directions to choose from in discovery

### Direction A — Adapter integration

Modify `fireSignal` adapter (`plugin/src/tools/_adapters.ts`) to optionally take a `store` + `changeId` and call `store.changes.refresh(changeId)` after the signal succeeds.

```typescript
async function fireSignal<T>(
  handle: WorkflowHandle,
  signal: SignalDefinition<T>,
  payload: T,
  refreshContext?: { store: Store; changeId: string },
): Promise<void> {
  await handle.signal(signal, payload);
  if (refreshContext) {
    await refreshContext.store.changes.refresh(refreshContext.changeId);
  }
}
```

Pro: minimal call-site change (just add `{ store, changeId }` arg). Con: optional parameter is forgettable; doesn't enforce.

### Direction B — Helper extraction

Extract `fireSignalAndRefresh(handle, signal, payload, store, changeId)` as a separate helper. Migrate all 19 sites to use it. Mark `fireSignal` as deprecated for tool-layer use; reserve direct `fireSignal` for cases where there is no associated changeId (rare).

Pro: harder to forget (if you call the wrong helper, you skip refresh deliberately). Con: 19 mechanical edits.

### Direction C (potential) — Decorator / wrapping in store

Move the signal-firing into store methods alongside their existing query+cache logic (mirroring how `store.gates.complete()` works today: invalidate → signal → query → setCachedChange). Migrate tools to call store methods instead of firing signals directly.

Pro: best long-term separation of concerns; tools don't know about Temporal handles at all. Con: largest refactor; some signals don't have a natural store-method home (e.g. `taskAssignedSignal`, `taskBlockedSignal`).

Discovery should pick A vs B vs C based on cost/benefit.

## Success Criteria

1. Every existing `fireSignal(handle, ...)` call site in `plugin/src/tools/` (currently 19, including the 2 already-fixed gate-path sites) goes through the centralized refresh path.
2. The bug reproduction from the Problem Statement (`adv_task_reclassify_tdd` → `adv_change_archive` returns stale state) no longer occurs in a fresh session against current trunk.
3. A regression test exists for each of: task-mutation tools (update, add, cancel, reclassify), change-mutation tools (close, reenter), wisdom (add), reflection, conformance, worktree, and checkpoint — asserting that `store.changes.refresh` is called after the signal fires.
4. The existing gate-path fix (`4a3e81f`) is updated to use the new centralized pattern (no parallel implementations).
5. `pnpm test` passes with new + existing tests; no regressions.
6. `AGENTS.md` (or equivalent agent-facing doc) describes the chosen pattern so future tool authors know which helper to call.
7. The "reentry workaround" used in audit session 2026-05-07 is no longer needed for any mutation→read sequence.

## Error Handling and Rollback

### Failure modes during the fix execution

1. **`store.changes.refresh` itself fails** (Temporal query rejected, network blip)
   - Refresh is best-effort by design (existing behavior). Failure is logged but does not throw.
   - The signal has already succeeded by the time refresh runs; the workflow state is correct.
   - Subsequent reads will hit the cache once and may see stale state until the next mutation refreshes; not catastrophic.

2. **A specific call site doesn't fit the centralized pattern** (e.g. a signal without a single associated changeId)
   - Discovery enumerates these explicitly. Any exceptions get documented in code with `// rq-cacheRefresh01-exempt` comment + reason.
   - Tests cover the exemptions to prevent silent regressions.

3. **Migration introduces test regressions** (some test depends on cache being stale)
   - That test was relying on a bug — fix the test alongside the migration.
   - Pin the new contract: post-mutation reads see fresh data.

### Rollback

- The change is a refactor, not a feature. Rollback is `git revert` of the migration commit.
- Each affected call site keeps its current `fireSignal` import; the migration adds the refresh call. Reverting reverts only the refresh integration, not the signal logic.

## Open design questions for discovery

1. **Direction A vs B vs C** — which design balances safety, refactor cost, and future maintainability?
2. **Cache invalidation cost** — measure: does adding a Temporal query after every mutation introduce latency that matters? If so, can we batch or defer?
3. **Cross-project tools** — `target_path` mutations cross project boundaries. The refresh needs to invalidate the target project's cache, not the calling project's. Direction A and B both need to handle this; Direction C handles it naturally via the store interface.
4. **Conformance / non-change signals** — some signals don't have a clear changeId (e.g. project-level conformance signals). Confirm the affected list and decide whether to exempt those sites.
5. **Documentation surface** — where should the "use fireSignalAndRefresh, not fireSignal" rule live? AGENTS.md? An ADR? Both?

## Non-goals (intentionally deferred)

- Replacing the cache implementation (e.g. moving to Redis or a TTL cache). The current in-memory cache is fine; the bug is about invalidation discipline, not cache mechanism.
- Adding a generic post-mutation hook system. This change is a focused fix, not a plugin architecture.
- Rewriting `fireSignal` to be async-iteration / streaming-aware. Out of scope for this fix.
