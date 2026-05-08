## Implementation Strategy

### Current path

`getGuardedChangeHandle(input, changeId)`:
1. calls `input.legacy.changes.get(changeId)`
2. if returned change has `adv_project_id`, compare with `input.projectId`
3. throw `AdvProjectContextMismatchError` on mismatch
4. return `getChangeHandle(input, changeId)`

### Proposed change

Add module-local WeakMap cache in `plugin/src/storage/store-temporal/shared.ts`:

```ts
const ownerGuardCache = new WeakMap<TemporalStoreBackendInput, Map<string, string>>();
```

Semantics:
- Keyed by `TemporalStoreBackendInput` object, so cache lifetime follows store backend lifetime.
- Inner key: changeId.
- Value: validated owning project ID.
- Cache only successful owner-bearing reads (`adv_project_id` exists and matches current `projectId`).
- Do **not** cache ownerless reads. Ownerless is legacy-compatible, but disk projection may later gain `adv_project_id`; re-read keeps that safe.
- Do **not** cache mismatches. Always throw based on current disk snapshot.
- Do **not** cache workflow handles. Always call `getChangeHandle(...)` so Temporal handle lookup remains fresh and cheap.

### Tests

Add `plugin/src/storage/store-temporal/shared.test.ts` or extend existing shared test coverage:
- matching owner, two calls → `legacy.changes.get` called once; workflow `getHandle` called twice.
- mismatched owner throws `AdvProjectContextMismatchError`.
- ownerless passes through; two calls read twice (not cached).

### Risk

Low. Cache stores only stable project ownership for owner-bearing changes, scoped by store input lifetime. Mismatch and ownerless cases remain uncached.