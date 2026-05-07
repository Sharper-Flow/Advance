# Archive: centralizeMutationCacheRefresh

**Change ID:** centralizemutationcacherefresh
**Archived:** 2026-05-07T20:45:31.957Z
**Created:** 2026-05-07T18:11:42.243Z

## Tasks Completed

- ✅ M0/T01: Create `fireSignalAndRefresh` helper in `plugin/src/tools/_adapters.ts` with both overloads (handle-form and input-form) plus JSDoc documenting the rule (including cross-project note). Add unit tests to `_adapters.test.ts` asserting: (a) both overloads compile and execute, (b) `store.changes.refresh` is called with correct `changeId` after signal fires, (c) refresh failure is swallowed (logged) and does not throw. RED: write failing test first. GREEN: implement helper.
  > Task checkpoint completed
- ✅ M1/T02: Step 0 — Switch `adv_conformance` from `bindToolSimple` to `bindTool` in `plugin/src/tool-registry.ts:455-460`. Update conformance action function signatures in `plugin/src/tools/conformance.ts:380-460` from `(rawArgs, projectDir, externalRoot?)` to `(rawArgs, store, projectDir, externalRoot?)`. Update `conformance.test.ts` to match new signature. Verify all existing conformance tests still pass with no behavior change. This is pure threading — no functional change.
  > Task checkpoint completed
- ✅ M2/T03: Step 1 — Migrate `plugin/src/tools/wisdom.ts:90` from `fireSignal(handle, wisdomAddedSignal, ...)` to `fireSignalAndRefresh(handle, store, changeId, wisdomAddedSignal, ...)`. Add regression test in `wisdom.test.ts` asserting `store.changes.refresh` is called with the correct changeId after the signal. RED: test fails before migration; GREEN: passes after.
  > Task checkpoint completed
- ✅ M2/T04: Step 2 — Migrate `plugin/src/tools/reflection.ts:577` from `fireSignal(handle, reflectionRecordedSignal, ...)` to `fireSignalAndRefresh(handle, store, changeId, reflectionRecordedSignal, ...)`. Add regression test in `reflection.test.ts` asserting `store.changes.refresh` is called. RED → GREEN inline.
  > Task checkpoint completed
- ✅ M2/T05: Step 3 — Migrate `plugin/src/tools/checkpoint.ts:305` from `fireSignal(handle, taskCompletedSignal, ...)` to `fireSignalAndRefresh(handle, store, changeId, taskCompletedSignal, ...)`. Add regression test in `checkpoint.test.ts` asserting `store.changes.refresh` is called. RED → GREEN inline.
  > Task checkpoint completed
- ✅ M3/T06: Step 4 — Migrate all 8 `fireSignal(handle, ...)` sites in `plugin/src/tools/task.ts` (lines 330, 336, 343, 355, 529, 603, 760, 875) covering `taskAssignedSignal`, `taskBlockedSignal`, `taskCompletedSignal` (×2), `taskUpdatedSignal` (×2), `taskAddedSignal`, `taskCancelledSignal`. Add regression tests in `task.test.ts` for each major surface: task update (in_progress, blocked, done, other), task add, task complete (separate path), task cancel, task reclassify_tdd. RED → GREEN per signal.
  > Task checkpoint completed
- ✅ M4/T07: Step 5 — After T02 binding switch, migrate `plugin/src/tools/conformance.ts:125` dispatcher (`signalConformance`) to use `fireSignalAndRefresh`. Plumb `store` (now in scope post-T02) into the closure. Add regression test in `conformance.test.ts` asserting `store.changes.refresh` is called when conformance signals fire with a changeId. Blocked by T02.
  > Task checkpoint completed
- ✅ M4/T08: Step 6 — Migrate 3 sites in `plugin/src/tools/change.ts`: cancellation single (line 1549, `changeCancelledSignal`), cancellation bulk (line 1676, `changeCancelledSignal` in loop), reenter (line 2193, `gateReenteredSignal`). Use `fireSignalAndRefresh(handle, store, changeId, signal, ...)` with refresh AFTER signal so subsequent reads see closed/cancelled or reset-gates state. Add regression tests in `change.test.ts` for each: change cancel single, change bulk-close, change reenter. RED → GREEN per site.
  > Task checkpoint completed
- ✅ M4/T09: Step 7 — Add `store: StoreBackend` field to `AdvWorktreeCreateDeps` and `AdvWorktreeDeleteDeps` interfaces in `plugin/src/tools/worktree/index.ts:696-718`. Thread `store` from `plugin/src/tools/adv-worktree.ts:66-81` execute functions into the deps construction. Then plumb `store` into `fireWorktreeSignal` closure (line 110-130) and migrate `fireSignal(handle, signal, payload)` (line 124) to `fireSignalAndRefresh(handle, store, changeId, signal, payload)`. Add regression test in `worktree.test.ts` asserting `store.changes.refresh` is called when worktree signals fire with a changeId. RED → GREEN.
  > Task checkpoint completed
- ✅ M5/T10: Step 8 — Replace inline `await store.changes.refresh(changeId)` in `plugin/src/tools/gate.ts` `completeGateAndBuildResponse` (lines 76-85, added by commit 4a3e81f). Migrate the 2 fireSignal call sites (lines 239, 542) to `fireSignalAndRefresh(handle, store, changeId, gateCompletedSignal, ...)`. Remove the inline refresh from `completeGateAndBuildResponse` body. Verify existing test from 4a3e81f (`gate.test.ts:311,351`) still passes — should require minimal/no changes since the contract (refresh called) is preserved, just at a different layer. RED → GREEN.
  > Task checkpoint completed
- ✅ M6/T11: Final verification. Run `pnpm test && pnpm run check && pnpm run build` from `plugin/` — all three must exit 0. Run `grep -rn "fireSignal(handle" plugin/src/tools/ | grep -v ".test.ts"` and confirm zero non-exempt matches (AC2). Verify reproduction described in problem-statement (`adv_task_reclassify_tdd` → `adv_change_archive` returning stale state) no longer occurs against rebuilt trunk in a fresh session — document evidence in implementation_summary. Add JSDoc rule reference to AGENTS.md or appropriate doc surface.
  > Task checkpoint completed

## Specs Modified

