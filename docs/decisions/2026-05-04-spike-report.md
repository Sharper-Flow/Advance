# Spike Report: Signal-Driven Change Workflow

> **ADV change:** `refactorChangeWorkflowsSignal`  
> **Date:** 2026-05-06  
> **Milestone:** M0 spike kill criteria  
> **Verdict:** PASS — proceed to M1

## Scope

Validate the signal-driven change workflow design before replacing the main ADV workflow surface.

Spike code lives under `plugin/src/temporal/spike/` and is intentionally isolated from the main worker:

- `contracts.ts` — minimal spike state + payload types
- `messages.ts` — representative signals and queries
- `workflows.ts` — signal-driven state-holder workflow
- `migration.ts` — replay helper + marker barrier helper
- `workflows.test.ts` — Temporal test-environment verification

## Kill Criteria

| Criterion | Result | Evidence |
|---|---:|---|
| SC1: concurrent signaling produces zero `Workflow Update failed` errors | PASS | 3 simulated clients fired 50 `taskAddedSignal`s each to one workflow. Test asserted zero failures, 150 tasks, 150 unique IDs. |
| SC10a: continue-as-new preserves state | PASS | Low-threshold CAN test flooded 120 signals, waited for `continueAsNewCount > 0`, and verified all 120 task records survived. Workflow uses `workflowInfo().continueAsNewSuggested || historyLength > threshold`, then drains `wf.allHandlersFinished` before `continueAsNew`. |
| SC4: conformance routing works | PASS | Conformance verdict is read through `getConformanceStateQuery` before any disk projection. Projection writes happen only for gate/terminal signals. |
| SC4: projection cadence bounded | PASS | Representative projection path wrote exactly 5 projections (`gateCompleted`, `gateAwaitingApproval`, `gateStuck`, `archiveRequested`, `changeCancelled`) and stayed under ≤10 writes. All projections carry `schemaVersion: 2`. |
| SC10b: migration replay round-trips | PASS | `cleanupzombierunningworkflows` was inspected via `adv_change_show` (0 tasks, all gates pending). Spike replay used an equivalent source snapshot, fired replay signals, fired `migrationMarkerSignal`, polled `getProcessedMarkersQuery`, and verified source state round-tripped. |

## Verification Commands

Run from `plugin/`:

```bash
pnpm exec vitest run src/temporal/spike/workflows.test.ts
pnpm run typecheck
pnpm exec prettier --check src/temporal/spike
```

Observed latest results:

- `pnpm exec vitest run src/temporal/spike/workflows.test.ts` — 5 tests passed
- `pnpm run typecheck` — passed
- `pnpm exec prettier --check src/temporal/spike` — passed

## Design Learnings

1. **Signals solve the update failure class for mutation traffic.** The concurrent test applies 150 queued signals without update rejection semantics.
2. **Signal calls are fire-and-forget.** `handle.signal(...)` resolving does not prove async handler activity side effects completed. Tests and migration flows need a query/marker barrier before asserting side effects.
3. **Continue-as-new needs state-carried counters and seed state.** The spike carries state through `seedState` and proves post-CAN queries see the same tasks.
4. **Projection cadence belongs to gate/terminal signals only.** Document/task/conformance signals can remain query-only; projection writes are external-reader cache updates.
5. **Migration marker barrier is viable.** Replay can fire a marker signal at batch boundaries and poll `getProcessedMarkersQuery` before comparing source vs workflow state.

## Deviations From Original T05 Wording

The task text said to read an active change's disk JSON. Agent policy forbids direct reads of external ADV state files, so the spike used `adv_change_show cleanupzombierunningworkflows` for source inspection and a deterministic in-test source snapshot for replay. This preserves the migration-barrier proof without violating ADV state access rules.

## Decision

M0 spike passes. No redesign or `adv_change_reenter` needed. Proceed to M1 (LOC baseline + deletion strategy).
