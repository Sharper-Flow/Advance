# Contract Traceability

**Change ID:** fixStatusRepairCache
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-08T22:58:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | T2 integration test verifies store.changes.refresh is called with correct changeId; combined with implementation that calls bestEffortRefresh, the next store.changes.get() re-seeds from disk and returns the repaired status. |
| SC2 | success_criterion | pass | review | adv_reflect reads via store.changes.show. With cache invalidated, store.changes.show returns the corrected status, satisfying adv_reflect's status guard. Direct unit verification of adv_reflect deferred to user flow; cache-consistency chain is the mechanism. |
| SC3 | success_criterion | pass | review | Full test suite: 3607 pass, 2 pre-existing failures (cli-surface-matrix, tool-registry) confirmed unrelated by baseline run on c4bf25de before fixStatusRepairCache commits. |
| AC1 | acceptance_criterion | pass | test | plugin/src/tools/_recovery-writers.ts line 192: `await bestEffortRefresh(input.store, input.change.id)` after saveChange. Test at line 300-301 asserts refresh called with "test-change". |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/_recovery-writers.test.ts lines 282-302: new test "calls store.changes.refresh after disk write to invalidate stale cache" asserts refresh is called with correct changeId. |
| AC3 | acceptance_criterion | pass | test | plugin/src/tools/change.status-repair.test.ts lines 230-259: new test uses real saveRecoveredChangeStatus via vi.importActual and asserts store.changes.refresh called with "wedgedChange". |
| AC4 | acceptance_criterion | pass | test | Full suite via oc-test-gate full: 3607 pass, 2 pre-existing unrelated failures. No regressions from this change. |
| C1 | constraint | respected | static_check | git diff confirms saveRecoveredGateCompletion (lines 118-139) and saveRecoveredArtifactMetadata (lines 145-162) are unchanged in this commit. |
| C2 | constraint | respected | static_check | No package.json changes. No new imports added to _recovery-writers.ts. |
| C3 | constraint | respected | static_check | Only plugin/src/tools/_recovery-writers.ts, _recovery-writers.test.ts, change.status-repair.test.ts modified. No changes to store-temporal/index.ts or store-temporal/changes.ts. |
| C4 | constraint | respected | static_check | bestEffortRefresh (line 49-59) wraps store.changes.refresh in try/catch and silently swallows errors. Terminal workflow failure cannot block the recovery. |
| DONT1 | avoidance | respected | review | Implementation uses bestEffortRefresh, not direct changeCache.set(). No cache internals exposed. |
| DONT2 | avoidance | respected | review | store.changes.refresh is called only via bestEffortRefresh wrapper, which has try/catch. |
| DONT3 | avoidance | respected | review | No modifications to adv_change_show, adv_change_list, or any read path. Fix is at the write path. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c154c64bedd1 | AC1 | AC1, AC2 | C1, C2, C3, C4, DONT1, DONT2, DONT3 |  |
| tk-b664b33052d2 | AC3 | AC3 | C3 |  |
| tk-68cca32c0d52 | AC4 | AC4, SC3 |  |  |
| tk-fa2f39040b40 |  |  |  | Mechanical task to wire dependencies between existing tasks. |
