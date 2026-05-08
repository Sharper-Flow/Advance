# Problem Statement

## What's broken

When a tool-layer code path fires a Temporal signal directly via `fireSignal(handle, ...)` (bypassing the store's mutation methods), the in-memory `changeCache` in `store-temporal/index.ts` is **not invalidated**. Subsequent reads of the same change in the same session — including reads performed by other tools moments later — return stale pre-signal state.

This is a follow-on regression introduced when R1 collapsed `wf.defineUpdate` declarations to signals. The signal-driven mutation contract works at the workflow layer, but the cache-invalidation discipline that the store's `gates.complete()` and other store methods enforce was not propagated to the tool-layer code paths that bypass the store.

## Concrete reproduction (live, audit session 2026-05-07)

```
Pre-condition: change has task tk-X with metadata.tdd_intent = "inline"

Action 1: adv_task_reclassify_tdd
  taskId: tk-X, toIntent: "separate_verification", approvedByUser: true, ...
Result:   { success: true, ... }
  → Temporal workflow now has tdd_intent = "separate_verification"
  → store.changes.changeCache still has tdd_intent = "inline" (stale)

Action 2: adv_change_archive changeId: <change>, ...
  Validation reads change from cache → sees stale "inline" intent on tk-X
Result:   { error: "Archive blocked: 1 validation error",
            code: MISSING_TDD_EVIDENCE, taskId: tk-X }
```

The reclassification was correct (Temporal has the new state). The archive read was correct (it asked the store). The cache-invalidation step in the middle was missing.

Workaround used in audit: `adv_change_reenter fromGate: "release"` then re-complete release gate. The gate-complete path triggers `store.changes.refresh(changeId)` via the previously-fixed `completeGateAndBuildResponse`, which clears the cache. Brittle; couples unrelated workflows.

## Affected call sites

`grep -n "fireSignal(handle" plugin/src/tools/` on current trunk `0d1eb7b`:

| File | Lines | Tool | Cache refresh status |
|---|---|---|---|
| gate.ts | 239, 542 | adv_gate_complete (planning + non-planning paths) | ✅ FIXED in commit `4a3e81f` |
| change.ts | 1600, 1727 | adv_change_close (cancellation paths) | ❌ stale |
| change.ts | 2244 | adv_change_reenter | ❌ stale |
| task.ts | 330 | adv_task_update (in_progress) | ❌ stale |
| task.ts | 336 | adv_task_update (blocked) | ❌ stale |
| task.ts | 343 | adv_task_update (done) | ❌ stale |
| task.ts | 355 | adv_task_update (other) | ❌ stale |
| task.ts | 529 | adv_task_add | ❌ stale |
| task.ts | 603 | adv_task_completed (separate tool path) | ❌ stale |
| task.ts | 760 | adv_task_cancel | ❌ stale |
| task.ts | 875 | adv_task_reclassify_tdd | ❌ stale |
| wisdom.ts | 90 | adv_wisdom_add | ❌ stale |
| reflection.ts | 577 | adv_reflect | ❌ stale |
| checkpoint.ts | 305 | adv_task_checkpoint | ❌ stale |
| conformance.ts | 125 | adv_conformance | ❌ stale |
| worktree/index.ts | 124 | adv_worktree_create / resume / delete | ❌ stale |

**19 affected sites** (gate.ts:239 and gate.ts:542 already covered by `4a3e81f`). Worktree, change, task, wisdom, reflection, conformance, and checkpoint paths all share the bug.

## Why this hasn't surfaced more

- Most tool calls are followed by other tools that go through different paths (Temporal queries instead of cache reads), so staleness is invisible.
- The bug surfaces specifically in mutation-then-read-via-cache sequences within the same session.
- Integration tests use `TestWorkflowEnvironment` and don't exercise the production cache path.

## Cost of inaction

- Silent stale reads after every mutation tool call. User runs a mutation, immediately runs `adv_change_show` or `adv_change_archive` or `adv_change_validate`, gets stale data with no error indication.
- Workarounds (reenter + re-complete) add brittle dependencies between unrelated tools.
- Future fix for any cache-related bug must defensively call refresh — increasing surface area.

## What we need (success criteria)

A solution that:

1. Eliminates cache staleness after any tool-layer fireSignal call without per-call-site bookkeeping
2. Makes the refresh discipline default-on (forgetting it is impossible), not opt-in
3. Doesn't require touching all 19 call sites manually (or, if it does, the touches are mechanical and auditable)
4. Doesn't degrade tool latency materially (refresh is a Temporal query — keep it constant-time-ish)
5. Has regression-test coverage that pins the contract for every signal-firing tool path
