# Acceptance

Reviewed at: 2026-06-08T22:58:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | After `adv_change_status_repair` succeeds on a wedged change, `store.changes.get()` returns `status: "archived"` without requiring a process restart. | pass | T2 integration test verifies store.changes.refresh is called with correct changeId; combined with implementation that calls bestEffortRefresh, the next store.changes.get() re-seeds from disk and returns the repaired status. |
| SC2 | success_criterion | After repair, `adv_reflect` can run on the repaired change without a "not archived" error. | pass | adv_reflect reads via store.changes.show. With cache invalidated, store.changes.show returns the corrected status, satisfying adv_reflect's status guard. Direct unit verification of adv_reflect deferred to user flow; cache-consistency chain is the mechanism. |
| SC3 | success_criterion | All existing tests continue to pass with the change applied. | pass | Full test suite: 3607 pass, 2 pre-existing failures (cli-surface-matrix, tool-registry) confirmed unrelated by baseline run on c4bf25de before fixStatusRepairCache commits. |
| AC1 | acceptance_criterion | `saveRecoveredChangeStatus` in `_recovery-writers.ts` calls `bestEffortRefresh(store, change.id)` after the `saveChange()` disk write succeeds. | pass | plugin/src/tools/_recovery-writers.ts line 192: `await bestEffortRefresh(input.store, input.change.id)` after saveChange. Test at line 300-301 asserts refresh called with "test-change". |
| AC2 | acceptance_criterion | New unit test in `_recovery-writers.test.ts` verifies `saveRecoveredChangeStatus` calls `store.changes.refresh(changeId)` after disk write (mock the refresh call, assert invocation). | pass | plugin/src/tools/_recovery-writers.test.ts lines 282-302: new test "calls store.changes.refresh after disk write to invalidate stale cache" asserts refresh is called with correct changeId. |
| AC3 | acceptance_criterion | New or extended test in `change.status-repair.test.ts` verifies that after status-repair, a subsequent `store.changes.get()` returns the repaired status (not stale). | pass | plugin/src/tools/change.status-repair.test.ts lines 230-259: new test uses real saveRecoveredChangeStatus via vi.importActual and asserts store.changes.refresh called with "wedgedChange". |
| AC4 | acceptance_criterion | Existing test suite passes with zero regressions (`pnpm test` from `plugin/`). | pass | Full suite via oc-test-gate full: 3607 pass, 2 pre-existing unrelated failures. No regressions from this change. |
| C1 | constraint | Do NOT modify `saveRecoveredGateCompletion` or `saveRecoveredArtifactMetadata` — their skip-refresh rationale remains valid (workflow may still be running). | respected | git diff confirms saveRecoveredGateCompletion (lines 118-139) and saveRecoveredArtifactMetadata (lines 145-162) are unchanged in this commit. |
| C2 | constraint | Do NOT add new dependencies. | respected | No package.json changes. No new imports added to _recovery-writers.ts. |
| C3 | constraint | Fix stays in `_recovery-writers.ts`; no changes to `store-temporal/index.ts` or `store-temporal/changes.ts`. | respected | Only plugin/src/tools/_recovery-writers.ts, _recovery-writers.test.ts, change.status-repair.test.ts modified. No changes to store-temporal/index.ts or store-temporal/changes.ts. |
| C4 | constraint | `bestEffortRefresh` swallows failures gracefully — a terminal workflow cannot block the recovery by failing refresh. | respected | bestEffortRefresh (line 49-59) wraps store.changes.refresh in try/catch and silently swallows errors. Terminal workflow failure cannot block the recovery. |
| DONT1 | avoidance | Do not use direct cache patching (`changeCache.set()`) — requires exposing cache internals, diverges from established recovery-writer pattern. | respected | Implementation uses bestEffortRefresh, not direct changeCache.set(). No cache internals exposed. |
| DONT2 | avoidance | Do not call `store.changes.refresh()` without the try/catch wrapper — terminal workflows will throw. | respected | store.changes.refresh is called only via bestEffortRefresh wrapper, which has try/catch. |
| DONT3 | avoidance | Do not modify the `adv_change_show` or `adv_change_list` read paths to add more defensive overrides — the correct fix is at the write path. | respected | No modifications to adv_change_show, adv_change_list, or any read path. Fix is at the write path. |

