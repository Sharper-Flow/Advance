# Contract Traceability

**Change ID:** fixWorktreeSetupready
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-07T13:38:10.568Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Root cause (unbound getHandle in getWorktreeRecord) fixed to bound client.workflow.getHandle. Standalone repro using the real @temporalio/client against the live change workflow now returns worktreeExistsForChange=true and getWorktreeRecord=record (was false/null). Fix deployed to runtime (dist 09:27). |
| SC2 | success_criterion | pass | review | worktreeExistsForChange predicate returns false for setup_failed, deleted, missing-path, setupReady:false, absent, and Temporal-unavailable; covered by state-record-probe.test.ts negative cases (all passing). |
| AC1 | acceptance_criterion | pass | test | change-state.worktree-auto-manage.test.ts asserts applyWorktreeCreatedToState stores setupReady:true with status:"created". Passing. |
| AC2 | acceptance_criterion | pass | test | state-record-probe.test.ts: true for ready + legacy-created; false for setup_failed/setupReady:false/deleted/missing-path/absent/Temporal-unavailable; plus new regression test for bound getHandle. Passing. |
| AC3 | acceptance_criterion | pass | test | Focused reducer/probe tests pass (state-record-probe + change-state.worktree-auto-manage). |
| AC4 | acceptance_criterion | pass | test | workflows.signal-handlers.test.ts and workflow-bundle-boundary.test.ts pass; 76/76 across focused suite incl. index-create. |
| AC5 | acceptance_criterion | pass | test | Escape clause satisfied: pnpm run build + deploy-local.sh --fix done; deployed dist contains bound workflowApi.getHandle. Live probe proven via standalone real-SDK tsx repro: worktreeExistsForChange(access,'fixWorktreeSetupready')===true. |
| C1 | constraint | respected | static_check | WorktreeCreatedSignalPayloadSchema (plugin/src/types/signals.ts) unchanged; no setupReady field added. setupReady stamped only at the reducer. |
| C2 | constraint | respected | static_check | worktreeExistsForChange excludes deleted/setup_failed and requires setupReady===true && path; setupReadyFromRecord preserves explicit false and missing-path. Predicate tests cover all branches. |
| C3 | constraint | respected | static_check | contracts.ts change is type-only ('created' literal added to a union); workflow-bundle-boundary.test.ts passes; no storage/tool/node:* imports introduced. |
| C4 | constraint | respected | static_check | No new workflow commands/updates/nondeterminism. Reducer change (setupReady stamp) and type addition are replay-safe; bundle build clean; boundary test green. |
| C5 | constraint | respected | static_check | All file edits, builds, and git checkpoints performed in the change worktree; only durable ADV state transitions routed from main via target_path. File-write isolation untouched. |
| DONT1 | avoidance | respected | review | No changes to advWorktreeResume or setup-hook lifecycle; fix is confined to getWorktreeRecord read path + status type + test. |
| DONT2 | avoidance | respected | review | No archive behavior changes; fixArchiveReleaseWithoutMerge scope untouched. |
| DONT3 | avoidance | respected | review | Existing-worktree detection reads the durable change-workflow worktrees map via getWorktreeRecord (Temporal query); no heuristic filesystem path inference added. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Signal payload schema not changed (also enforced by C1). |
| OOS2 | out_of_scope | not_applicable | not_applicable | Branch materialization / postCreate hooks not touched. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Archive release/merge enforcement not touched. |
| OOS4 | out_of_scope | not_applicable | not_applicable | adv_change_list latency not addressed; remains a separate tooling item. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d2a5776f8c61 | SC1, AC1, C1, C3, C4 | AC1, AC3 | C1, C2, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3 |  |
| tk-f21723ab4b8a | SC2, C2 | SC2, AC2, AC4, C1, C2, C3, C4 | C1, C2, C3, C4, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3, OOS4 |  |
| tk-a2fdbd0890f8 |  | SC1, AC5, C5 | C5, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3, OOS4 |  |
| tk-e334636cf865 | SC1, AC2 | SC1, SC2, AC2, AC5 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, OOS1, OOS2, OOS3, OOS4 |  |
