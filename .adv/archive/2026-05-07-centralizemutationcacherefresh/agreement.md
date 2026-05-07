# Agreement — centralizeMutationCacheRefresh

## Objectives

1. **Eliminate silent stale-cache-after-mutation** across all 18 signal-firing tool-layer call sites in `plugin/src/tools/`.
2. **Centralize the refresh discipline** so future tool authors cannot accidentally fire a signal without invalidating the cache.
3. **Eliminate parallel implementations** — the inline `await store.changes.refresh(changeId)` added in `4a3e81f` (gate.ts) migrates to the new centralized helper.

## Chosen direction: B (helper extraction)

After discovery comparison of A/B/C against current architecture:

- **A (modify fireSignal in place)** — rejected: optional `{store, changeId}` arg is forgettable; backward-compatibility cost preserves the bug class.
- **B (new fireSignalAndRefresh helper)** — chosen: mechanical migration, hard-to-misuse, matches existing `fireSignal` overload signature and existing 4a3e81f pattern.
- **C (store decorator)** — rejected for this change: too broad (~18 tools + store API reshape); not all signals have a natural store-method home (e.g. `taskAssignedSignal`, `taskBlockedSignal`); revisit as future architectural cleanup.

### Helper signature

```typescript
// plugin/src/tools/_adapters.ts
export async function fireSignalAndRefresh<Args extends unknown[]>(
  handle: WorkflowHandleLike,
  store: StoreBackend,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
export async function fireSignalAndRefresh<Args extends unknown[]>(
  input: TemporalStoreBackendInput,
  changeId: string,
  signal: unknown,
  ...args: Args
): Promise<void>;
```

(Two overloads matching existing `fireSignal` style — the input-form auto-resolves the handle, then refreshes the cache from the same store.)

## Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| AC1 | `fireSignalAndRefresh` helper exists in `plugin/src/tools/_adapters.ts` with both overloads | Code present + unit test |
| AC2 | All 18 production `fireSignal(handle, ...)` call sites migrated to `fireSignalAndRefresh` OR explicitly marked exempt with `// rq-cacheRefresh01-exempt: <reason>` | `grep -n "fireSignal(handle" plugin/src/tools/` returns zero non-test, non-exempt matches |
| AC3 | The inline `await store.changes.refresh(changeId)` in `gate.ts:completeGateAndBuildResponse` is replaced by helper call | Code diff |
| AC4 | Reproduction (`adv_task_reclassify_tdd` → `adv_change_archive` stale state) no longer occurs against rebuilt trunk in a fresh session | Manual session test |
| AC5 | Regression test pinning the contract for each major tool — task update/add/cancel, change close/reenter, wisdom add, reflection record, conformance, checkpoint, worktree | `pnpm test` includes ≥9 new tests asserting `store.changes.refresh` is called after signal fires |
| AC6 | `pnpm test` passes (≥1356 + new tests). `pnpm run check` passes. `pnpm run build` clean | CI-equivalent local run |
| AC7 | `_adapters.ts` JSDoc documents the rule: "Tool-layer code SHALL use `fireSignalAndRefresh` for signals associated with a changeId" | Code comment present |
| AC8 | Hand-bundle reentry workaround used in audit 2026-05-07 no longer required for any mutation→read sequence | Reproduction test (AC4) covers this |

## In Scope

- Audit + migration of the 18 fireSignal direct call sites in `plugin/src/tools/`
- New `fireSignalAndRefresh` helper in `_adapters.ts`
- Removal of inline refresh in `gate.ts` (replaced by helper)
- Per-tool regression tests pinning the cache-refresh contract
- JSDoc documentation in `_adapters.ts`

## Out of Scope

- Direction C (store-layer signal absorption) — revisit later as architectural cleanup
- Refactoring `fireSignal` itself
- Workflow-layer changes
- Adding new tool features
- Cache implementation change (in-memory cache stays)

## Non-trivial Edge Cases (carry into design)

| Edge case | File | Decision needed |
|---|---|---|
| Generic dispatcher | `worktree/index.ts:124` (`fireSignal(handle, signal, payload)` from a generic worker, signal type unknown at site) | Wrap dispatcher to take changeId for refresh, OR mark exempt + document why |
| Project-level signal | `conformance.ts:125` (may not associate with a changeId) | Confirm signal target during design; may be exempt |
| Cancellation paths | `change.ts:1549, 1676` (changeCancelledSignal) | Order: refresh BEFORE state moves to cancelled? After? Design must specify |
| Reenter signal | `change.ts:2193` (gateReenteredSignal) | Same ordering question — does refresh after reenter return correct gate state? |

## Error Handling

- Refresh failure (Temporal query fails) — logged, NOT thrown. Signal already succeeded; state correct on next read.
- Migration regression in tests — fix the test (it was relying on stale-cache behavior, which was a bug).
- Helper API mistakes (wrong overload) — caught at compile time by overload signatures.

## Rollback

Pure refactor. `git revert` the migration commits. Each call site retains its current `fireSignal` import; the migration adds the helper call. Reverting reverts only the helper integration, not the signal logic.
