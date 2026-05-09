## Current-State Evidence

- `plugin/src/tools/gate.ts` computes `adv_gate_status` from `activeStore.changes.get(changeId)`, then opportunistically overrides gates with a direct Temporal `getGateStatusQuery` (`querySignal`) before calculating `incomplete` and `canArchive`.
- `plugin/src/tools/change.ts` runs `adv_change_archive` preflight from the `change` returned by `store.changes.get(changeId)` and passes `change.gates` into `getArchivePreflightError`.
- Existing `getGateDivergenceHint` only compares store-backed gates with disk `loadChange(...)`; it does not query the live gate-status workflow query that `adv_gate_status` already trusts.
- `plugin/src/storage/store-types.ts` documents the known stale-cache regression class: stale `changeCache` can leave gates pending and block `adv_change_archive` after gate completion.
- `plugin/src/tools/gate.test.ts` pins `adv_gate_complete` use of `fireSignalAndRefresh`, but `plugin/src/tools/change.test.ts` has no archive regression test for "cached gates stale, live gate query complete".

## Objectives

- Make archive gate preflight use the same effective gate truth as `adv_gate_status`: live workflow gate status when available, with safe fallback to loaded change gates.
- Keep archive blocking for genuinely incomplete gates.
- Improve mismatch diagnostics so contradictory state points to exact sources and recovery action.

## Acceptance Criteria

- AC1: A regression test models stale/incomplete `change.gates` with live `getGateStatusQuery` returning all gates done, and `adv_change_archive` no longer returns the incomplete-gates preflight error.
- AC2: A regression test proves genuinely incomplete live gates still block archive with `incompleteGates` populated.
- AC3: Archive diagnostics for gate mismatch include store-backed incomplete gates, live-query gate state if available, disk divergence hint only when relevant, and safe recovery guidance.
- AC4: `adv_change_archive`, `adv_gate_status`, and `adv_change_show` remain consistent for archive-ready changes.
- AC5: Verification includes targeted tests plus `pnpm run check` from `plugin/`.

## Out of Scope

- Full archive workflow redesign.
- Gate model redesign.
- Historical manual archive repair unless needed for final validation.

## Risks / Constraints

- Do not make disk projection authoritative over live Temporal gate state for correctness.
- Do not silently bypass task preflight or validation errors.
- Keep fallback behavior safe when Temporal service is unavailable or gate query fails.