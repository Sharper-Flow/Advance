# Archive: Fix gate auto worktree

**Change ID:** fixGateAutoWorktree
**Archived:** 2026-05-22T03:00:13.756Z
**Created:** 2026-05-21T05:33:42.634Z

## Tasks Completed

- ✅ Wire target-aware gate mutation workdir and auto-manage deps
  > Added target-aware cwd selection in target-project.ts and wired adv_gate_complete to use the active target store root for worktree isolation. Preserved production auto-managed resume deps via buildWorktreeAutoManageDeps(activeStore). Added gate/worktree-auto-manage regression coverage for target_path gate completion, main-checkout auto-managed violation with expectedWorktreePath, proposal exemption, and defensive missing-runtime behavior.
- ✅ Wire target-aware task mutation workdir
  > Wired guarded task mutations to resolve mutation cwd through the active target store when target_path is present, preventing task_add/task_update isolation checks from using the host process cwd. Added task regression coverage for target_path task creation using target root git-session detection.
- ✅ Remove legacy worktree aliases and align specs/instructions
  > Removed legacy worktree_create/worktree_delete/worktree_cleanup alias registration and degraded title entries. Updated rq-warpModeContract06 to require non-registration of legacy aliases. Updated ADV agent allowlists, command docs, worktree skill, and asset/registry tests to use canonical adv_worktree_* names only.
- ✅ Stabilize blocking full-suite worktree cleanup test and verify release bar
  > Stabilized pending-delete full-suite test state by using fixture-specific synthetic project IDs instead of a shared constant. Verified the complete branch with targeted tests, static checks, build, and full test suite. Confirmed build output leaves git status clean.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `adv_change_update` writes provided empty strings as artifact contents; omit fields entirely to leave artifacts unchanged. Passing `proposal:""`/`agreement:""` can temporarily trip artifact readiness until restored.
- **[success]** Full-suite worktree cleanup tests are safer when fixture project IDs derive from per-test temp paths; shared constants can leak external pending-delete state across runs.
