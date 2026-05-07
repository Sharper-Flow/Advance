# Design — centralizeMutationCacheRefresh

## Overview

Implement Direction B: a new `fireSignalAndRefresh` adapter helper that fires a Temporal signal and immediately refreshes the in-memory `changeCache` for the affected change. Migrate all 18 production `fireSignal(handle, ...)` direct call sites to the new helper. Replace the inline `await store.changes.refresh(changeId)` in `gate.ts` (added by `4a3e81f`) with the helper.

**Validator (adv-researcher) verdict: CAUTION.** Three concerns identified and addressed in this revision (see Migration Plan and Spec Delta).

## Helper Implementation

### File

`plugin/src/tools/_adapters.ts` (extend existing module)

### Signature

```typescript
export async function fireSignalAndRefresh<Args extends unknown[]>(
  handle: WorkflowHandleLike,
  store: StoreBackend,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignalAndRefresh<Args extends unknown[]>(
  input: TemporalStoreBackendInput,
  store: StoreBackend,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignalAndRefresh<Args extends unknown[]>(
  target: SignalTarget,
  store: StoreBackend,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void> {
  await fireSignal(target as never, ...(isWorkflowHandleLike(target) ? [signal, ...args] : [changeId, signal, ...args]));
  await store.changes.refresh(changeId);
}
```

### Behavior

1. Fire signal via existing `fireSignal()` (preserves transient retry semantics)
2. After signal succeeds → call `store.changes.refresh(changeId)` (drops cache entry, re-fetches)
3. Refresh failure is logged inside the store and does NOT throw (signal already succeeded; consistency restored on next read)

### Tests

`plugin/src/tools/_adapters.test.ts` (extend):
- Asserts both overloads compile and execute correctly
- Asserts `store.changes.refresh` is called with correct `changeId` after signal fires
- Asserts refresh failure is swallowed (logged) and does not throw

## Migration Plan

### Order: leaf-first, generic-dispatcher last, conformance binding-switch first

| # | File | Sites | Strategy |
|---|---|---|---|
| 0 | `tool-registry.ts` | n/a | **NEW (validator C1):** Switch `adv_conformance` from `bindToolSimple` to `bindTool` so the action functions receive `store` in scope. Action signatures change from `(rawArgs, projectDir, externalRoot?)` to `(rawArgs, store, projectDir, externalRoot?)`. No external behavior change; pure threading. Tests in `conformance.test.ts` updated to reflect new signature. |
| 1 | `wisdom.ts` | 1 (line 90) | Direct migrate; clean test target |
| 2 | `reflection.ts` | 1 (line 577) | Direct migrate |
| 3 | `checkpoint.ts` | 1 (line 305) | Direct migrate |
| 4 | `task.ts` | 8 (330, 336, 343, 355, 529, 603, 760, 875) | Migrate per signal type; covers most surface area |
| 5 | `conformance.ts` | 1 (line 125) | After Step 0 binding switch, `store` is now in scope at the dispatcher. Plumb into `signalConformance(...)` closure and use `fireSignalAndRefresh`. |
| 6 | `change.ts` | 3 (1549, 1676, 2193) | Cancellation + reenter paths; `store` already available via `bindTool`. Refresh AFTER cancel/reenter signal so the next read sees the new state. |
| 7 | `worktree/index.ts` | 1 (line 124) | **Updated (validator C2):** Add `store: StoreBackend` field to `AdvWorktreeCreateDeps` and `AdvWorktreeDeleteDeps` interfaces in `worktree/index.ts`. Thread `store` from `adv-worktree.ts` execute functions (lines 66-81) into the deps construction. Then plumb into `fireWorktreeSignal` closure and use `fireSignalAndRefresh`. |
| 8 | `gate.ts` | 2 (239, 542) | Replace inline `await store.changes.refresh(changeId)` in `completeGateAndBuildResponse` with helper at call sites; remove inline refresh from helper body. |

Each step: edit + run targeted vitest + commit. Total: 9 commits + 1 helper-creation commit + 1 doc commit = 11 commits.

## Edge Case Resolutions

| Edge case | Resolution |
|---|---|
| `worktree/index.ts:124` generic dispatcher | Step 7: thread `store` through `AdvWorktreeCreate/DeleteDeps` interfaces, then dispatcher uses `fireSignalAndRefresh`. |
| `conformance.ts:125` project-level signal | Step 0: switch binding to `bindTool` so `store` is in scope. Step 5: dispatcher uses `fireSignalAndRefresh`. |
| `change.ts:1549, 1676` cancellation paths | Step 6: `store` and `changeId` already available. Refresh AFTER signal — workflow moves to closed/cancelled, refresh sees the new state. |
| `change.ts:2193` reenter signal | Step 6: `store` and `changeId` already available. The next line `buildReentryResult(store, changeId, fromGate)` reads from store — refresh ensures it sees reset gates. |

## Per-Tool Regression Tests

Extend existing test files. Each test asserts: after the tool's `fireSignal` succeeds, `store.changes.refresh(changeId)` was called with the correct `changeId`.

| Test file | Coverage |
|---|---|
| `task.test.ts` | task update (in_progress, blocked, done, other), task add, task complete, task cancel, task reclassify_tdd |
| `wisdom.test.ts` | wisdom add |
| `reflection.test.ts` | reflection record |
| `checkpoint.test.ts` | task checkpoint |
| `conformance.test.ts` | conformance signal dispatch (with new `bindTool` signature) |
| `change.test.ts` | change cancel (single + bulk), change reenter |
| `worktree.test.ts` | worktree signal dispatch (with new deps interface) |
| `gate.test.ts` | (existing test from `4a3e81f` — verify still passes after migration to helper) |

Total: ≥9 new test cases (one per major tool surface).

## Test Mocking Strategy

```typescript
const refreshSpy = vi.spyOn(store.changes, "refresh");
await tool.execute({...});
expect(refreshSpy).toHaveBeenCalledWith(changeId);
```

Pins the contract at the helper boundary without re-running real Temporal queries in unit tests.

## Documentation

`_adapters.ts` JSDoc on `fireSignalAndRefresh`:

> Fire a signal targeting a change workflow, then refresh the in-memory cache for that change.
> Tool-layer code SHALL use this helper for any signal associated with a `changeId`.
> Use `fireSignal` (without refresh) ONLY for signals not associated with a single change.
> Failure to refresh produces silent stale reads on subsequent `store.changes.get()` calls.
>
> Cross-project note: when mutating a change in another project via `target_path`, the refresh
> invalidates the TARGET project's cache (resolved via the `store` argument that wraps that
> project's StoreBackend), not the calling project's. Use `withTargetPathStore(...)` upstream
> to obtain the correct store reference before calling this helper.

## Rollback Plan

- Helper creation (commit 1) is reverted last; safe alone.
- Step 0 (conformance binding switch) is reverted independently — restores `bindToolSimple` and removes `store` arg from action functions. Safe but reverses C1 fix; subsequent migration commits would also need revert if Step 0 is undone.
- Each migration commit is independent — `git revert <sha>` of any single migration commit reverts only that file's helper adoption.
- Removal of inline refresh in `gate.ts` (commit 8) ordered last so the system is never in a "neither inline nor helper" state.

## Acceptance Verification (mapping to ACs)

| AC | Verification |
|---|---|
| AC1 | `grep -n "export async function fireSignalAndRefresh" plugin/src/tools/_adapters.ts` returns 1+ matches |
| AC2 | `grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts"` returns 0 lines (or all flagged with `// rq-cacheRefresh01-exempt:`) |
| AC3 | `git log -p plugin/src/tools/gate.ts` shows inline `await store.changes.refresh(changeId)` removed in this change's commits |
| AC4 | Manual reproduction in fresh session post-rebuild |
| AC5 | `pnpm test` reports ≥9 new test cases |
| AC6 | `pnpm test && pnpm run check && pnpm run build` exit 0 |
| AC7 | JSDoc grep on `_adapters.ts` confirms rule text including cross-project note |
| AC8 | AC4 reproduction implicitly covers this |

## Non-Goals (re-confirmed from agreement)

- Direction C (store-layer signal absorption)
- `fireSignal` rewrite
- Workflow-layer changes
- New tool features (Step 0 binding switch is mechanical, not functional)
- Cache implementation change

## Spec Delta (release gate)

New requirement added during archive:

```yaml
rq-cacheRefresh01:
  body: |
    Tool-layer code SHALL use fireSignalAndRefresh for signals associated
    with a changeId. Direct fireSignal use is permitted ONLY for signals
    without a changeId association (none currently exist; documented
    exemptions require // rq-cacheRefresh01-exempt: <reason> annotation).

    Cross-project: when a tool mutates a change in another project via
    target_path, the helper invalidates the TARGET project's cache via the
    store argument. Tools MUST resolve the target store via
    withTargetPathStore(...) BEFORE calling fireSignalAndRefresh.
  scenarios:
    - WHEN a tool fires a signal targeting a change workflow
      THEN it MUST use fireSignalAndRefresh(handle, store, changeId, signal, ...)
    - WHEN a developer adds a new signal-firing tool
      THEN they MUST follow the helper rule documented in _adapters.ts JSDoc
    - WHEN a code review identifies a fireSignal direct call associated with a changeId
      THEN it MUST be migrated or annotated as exempt with rationale
    - WHEN a tool mutates a cross-project change via target_path
      THEN the store argument to fireSignalAndRefresh MUST be the target project's store,
      obtained via withTargetPathStore(...) upstream
```

Capability: new `tool-cache-discipline.yaml` (per validator C3 recommendation — implementation discipline distinct from delivery behavior). Final placement decided during archive Phase 6.

## Validator Concerns Addressed

- **C1 (Blocker):** Step 0 added to migration plan — switch `adv_conformance` from `bindToolSimple` to `bindTool` so action functions receive `store`. This is a targeted, mechanical change to `tool-registry.ts`.
- **C2 (Non-blocking):** Step 7 explicitly documents the worktree deps interface threading required (`store: StoreBackend` added to `AdvWorktreeCreate/DeleteDeps`).
- **C3 (Minor):** Spec delta now includes cross-project scenario and helper docs include cross-project note. Capability proposed as new `tool-cache-discipline.yaml`.
