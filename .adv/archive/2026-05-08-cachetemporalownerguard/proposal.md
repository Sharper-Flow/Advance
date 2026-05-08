## Intent

Reduce duplicated guard disk reads in Temporal-backed change operations. The old `store-locks.ts` / `withChangeLock` path is gone, but the current Temporal owner guard still reads the legacy disk snapshot (`legacy.changes.get(changeId)`) on every `getGuardedChangeHandle(...)` call. Operations such as `adv_task_add` call several guarded paths in one tool execution (planning gate check, add signal, post-signal query/dual-write), producing N× duplicate disk reads for the same change.

This is part 7 of umbrella tracker `ag-55f13852-56ba-4829-937b-051b42917788` (Telemetry & Temporal follow-ups from fixTemporalContextMismatch).

## Scope

In scope:
- `plugin/src/storage/store-temporal/shared.ts` — cache validated owner project IDs per Temporal store input and change ID.
- Focused tests proving repeated guarded handle calls for the same owned change perform one legacy disk read while preserving mismatch rejection.

Out of scope:
- Disk-only store hot-path refactors.
- Broader performance scan across all `loadChange(...)` callsites.
- Changing project ownership semantics.
- Removing the owner guard.

## Success Criteria

- Repeated `getGuardedChangeHandle(input, changeId)` calls for a change with matching `adv_project_id` call `legacy.changes.get(changeId)` only once.
- Repeated calls still return fresh Temporal handles (do not cache workflow handles).
- Mismatched `adv_project_id` still throws `AdvProjectContextMismatchError`.
- Ownerless legacy changes remain compatible.
- `pnpm run check` passes.
- Targeted store-temporal shared tests pass.

## Out of Scope

- Caching ownerless reads forever (avoid masking late disk projection population).
- Caching mismatch failures.
- Rewriting tool-level planning guard flow.