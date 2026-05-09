## Design: archive gate preflight uses effective gate state

### Decision

Add a shared archive-side gate resolver in `plugin/src/tools/change.ts` that mirrors `adv_gate_status` gate selection:

1. Start with `change.gates ?? createDefaultGates()` from `store.changes.get(changeId)`.
2. If Temporal service + project ID are available, query the change workflow via `getGateStatusQuery` using the existing sequence from `gate.ts`: `getService()` → `getProjectId(store.paths.root)` → `getChangeHandle(...)` → `querySignal(...)`.
3. If the live query returns a valid gates object (`queriedGates && typeof queriedGates === "object"`), use it as the effective gate state for archive preflight.
4. If the live query is unavailable/fails, fall back conservatively to store-backed gates and include `liveQueryError` only when blocking.

### Implementation shape

- Import `getGateStatusQuery` from `../temporal/messages` and `querySignal` from `./_adapters` in `change.ts` (the file already imports `getService`, `getProjectId`, `getChangeHandle`).
- Add `resolveArchiveGateState(store, changeId, change)` returning:
  - `effectiveGates`
  - `storeGates`
  - `liveGates?: Gates`
  - `source: "live" | "store"`
  - `liveQueryError?: string`
- Change `getArchivePreflightError(...)` to accept resolved/effective gates instead of reading only `change.gates`.
- Keep task preflight first and unchanged.
- On incomplete effective gates, return current error plus richer fields:
  - `incompleteGates`
  - `gateStateSource`
  - `storeIncompleteGates`
  - `liveIncompleteGates` when available
  - `liveQueryError` when query failed
  - disk divergence hint from existing `getGateDivergenceHint` only as advisory context when live query failed and store gates are incomplete

### Test strategy

- In `plugin/src/tools/change.test.ts`, extend mocks for `querySignal` and `getGateStatusQuery`.
- Add RED test: stale store gates (`acceptance`/`release` pending) with live gates all `done` should not return the incomplete-gates preflight error. It may continue to later archive preconditions or dry-run success; assertion focuses on no incomplete-gates block and live query usage.
- Add blocking test: live gates incomplete should return incomplete-gates error even if store state is complete, proving live state remains authoritative when available.
- Existing tests cover close/reenter signal paths; no workflow-state changes needed.

### Safety properties

- Structural correctness: live `getGateStatusQuery` is the same typed gate map used by `adv_gate_status`; no heuristic inference.
- Fallback is conservative: if live query cannot run, archive still uses store-backed gates and blocks incomplete gates.
- Tasks and validation remain independent preflight checks; no bypass.

### Validator result

Independent validator verdict: VALIDATED. Required refinements incorporated:
- Reuse exact `gate.ts` adapter path.
- Use same object guard as `adv_gate_status`.
- Keep `getGateDivergenceHint` diagnostic-only after live query attempt.
- Capture live query error without swallowing blocking behavior.

### Verification

- `pnpm test -- src/tools/change.test.ts`
- `pnpm run check` from `plugin/`

### Not doing

- No disk-projection authority over gate correctness.
- No archive workflow redesign.
- No changes to gate completion semantics.