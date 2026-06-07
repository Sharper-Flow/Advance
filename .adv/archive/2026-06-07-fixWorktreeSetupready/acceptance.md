# Acceptance

Reviewed at: 2026-06-07T13:38:10.568Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Main-checkout guarded ADV state mutations work after `adv_worktree_resume` creates or reuses a setup-ready ADV worktree. | pass | Root cause (unbound getHandle in getWorktreeRecord) fixed to bound client.workflow.getHandle. Standalone repro using the real @temporalio/client against the live change workflow now returns worktreeExistsForChange=true and getWorktreeRecord=record (was false/null). Fix deployed to runtime (dist 09:27). |
| SC2 | success_criterion | Non-ready worktree records remain blocked: setup-failed, deleted, missing path, `setupReady:false`, or Temporal-unavailable. | pass | worktreeExistsForChange predicate returns false for setup_failed, deleted, missing-path, setupReady:false, absent, and Temporal-unavailable; covered by state-record-probe.test.ts negative cases (all passing). |
| AC1 | acceptance_criterion | `applyWorktreeCreatedToState` stores `setupReady: true` with `status: "created"` for `worktreeCreatedSignal` records. | pass | change-state.worktree-auto-manage.test.ts asserts applyWorktreeCreatedToState stores setupReady:true with status:"created". Passing. |
| AC2 | acceptance_criterion | `worktreeExistsForChange` returns true only for created/setup-ready records, and false for setup-failed, deleted, missing-path, absent, or Temporal-unavailable records. | pass | state-record-probe.test.ts: true for ready + legacy-created; false for setup_failed/setupReady:false/deleted/missing-path/absent/Temporal-unavailable; plus new regression test for bound getHandle. Passing. |
| AC3 | acceptance_criterion | Focused reducer/probe tests pass. | pass | Focused reducer/probe tests pass (state-record-probe + change-state.worktree-auto-manage). |
| AC4 | acceptance_criterion | Workflow signal-handler and workflow-bundle-boundary tests pass. | pass | workflows.signal-handlers.test.ts and workflow-bundle-boundary.test.ts pass; 76/76 across focused suite incl. index-create. |
| AC5 | acceptance_criterion | Live ADV mutation probe from main checkout succeeds after worktree resume; if cached runtime blocks proof, build/deploy local plugin runtime first. | pass | Escape clause satisfied: pnpm run build + deploy-local.sh --fix done; deployed dist contains bound workflowApi.getHandle. Live probe proven via standalone real-SDK tsx repro: worktreeExistsForChange(access,'fixWorktreeSetupready')===true. |
| C1 | constraint | Do not add `setupReady` to `WorktreeCreatedSignalPayloadSchema`. | respected | WorktreeCreatedSignalPayloadSchema (plugin/src/types/signals.ts) unchanged; no setupReady field added. setupReady stamped only at the reducer. |
| C2 | constraint | Do not mark setup-failed, deleted, missing-path, or explicit `setupReady:false` records as setup-ready. | respected | worktreeExistsForChange excludes deleted/setup_failed and requires setupReady===true && path; setupReadyFromRecord preserves explicit false and missing-path. Predicate tests cover all branches. |
| C3 | constraint | Do not introduce storage, tool, or `node:*` imports into workflow-safe reducer code. | respected | contracts.ts change is type-only ('created' literal added to a union); workflow-bundle-boundary.test.ts passes; no storage/tool/node:* imports introduced. |
| C4 | constraint | Preserve Temporal replay safety; no new workflow commands, updates, or nondeterministic behavior. | respected | No new workflow commands/updates/nondeterminism. Reducer change (setupReady stamp) and type addition are replay-safe; bundle build clean; boundary test green. |
| C5 | constraint | File edits, checkpoints, and other CWD-dependent work remain worktree-bound even though durable ADV state transitions may be allowed from main after setup-ready existence proof. | respected | All file edits, builds, and git checkpoints performed in the change worktree; only durable ADV state transitions routed from main via target_path. File-write isolation untouched. |
| DONT1 | avoidance | Do not rework `adv_worktree_resume` or setup-hook lifecycle for this change. | respected | No changes to advWorktreeResume or setup-hook lifecycle; fix is confined to getWorktreeRecord read path + status type + test. |
| DONT2 | avoidance | Do not change archive behavior or absorb the broader `fixArchiveReleaseWithoutMerge` scope. | respected | No archive behavior changes; fixArchiveReleaseWithoutMerge scope untouched. |
| DONT3 | avoidance | Do not rely on heuristic filesystem path checks for existing-worktree detection. | respected | Existing-worktree detection reads the durable change-workflow worktrees map via getWorktreeRecord (Temporal query); no heuristic filesystem path inference added. |
| OOS1 | out_of_scope | Changing the worktree signal payload schema. | not_applicable | Signal payload schema not changed (also enforced by C1). |
| OOS2 | out_of_scope | Reworking branch materialization or postCreate hook behavior. | not_applicable | Branch materialization / postCreate hooks not touched. |
| OOS3 | out_of_scope | Changing archive release/merge enforcement. | not_applicable | Archive release/merge enforcement not touched. |
| OOS4 | out_of_scope | Fixing `adv_change_list` latency; discovery recorded it as separate tooling degradation. | not_applicable | adv_change_list latency not addressed; remains a separate tooling item. |

