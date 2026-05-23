# Proposal: Fix audit hygiene

## Why

Machine audit showed Advance is operationally healthy at the Temporal/worker level, but several agent-facing diagnostics and hygiene paths are misleading or unsafe to let accumulate:

- Active-change listings can depend on in-process memo state, hiding changes and reporting `0/0` tasks even when full change state has completed tasks.
- Synthetic ADV test project/worktree directories accumulated heavily after interrupted test runs because baseline-preserving cleanup never reaps old residue.
- OpenCode session-debt scan can look at a relative `OPENCODE_DB=opencode.db` path and report missing DB even when the real canonical DB exists.
- Worktree WIP discovery queries every draft/pending/active workflow and surfaces poisoned non-worktree workflows as WIP noise.

## What Changes

- Make active change listing complete and consistent with full change state.
- Add safe synthetic-test residue prevention/cleanup so `0000000000000000*` dirs do not accumulate across runs.
- Fix OpenCode DB path resolution/diagnostics for relative `OPENCODE_DB`.
- Reduce poisoned-workflow WIP noise by narrowing or hardening worktree discovery.

## Success Criteria

- `adv_change_list` / `adv_status view:changes` do not return partial memo-only active sets.
- Task counts and last-activity fields in status/list surfaces match full change state for changes with completed tasks.
- Synthetic project/worktree test dirs are automatically cleaned when safe, including residue left by interrupted previous runs, without deleting real project dirs.
- `adv_status view:hygiene` reports `synthetic_project_dirs: 0` and `synthetic_worktree_dirs: 0` after cleanup in this environment.
- Session-debt scan locates the real OpenCode DB or emits a clear diagnostic when `OPENCODE_DB` is relative/misconfigured.
- Worktree WIP state no longer over-reports poisoned workflows that have no active worktree ownership, while preserving explicit poisoned-history evidence when relevant.
- Targeted tests cover each bug class; full `pnpm run check`, `pnpm test`, and `pnpm run build` pass.

## Error Handling / Rollback

- Active-list changes are read-path only; failing Temporal visibility or per-change queries must degrade to existing disk fallback behavior rather than aborting status/list surfaces.
- Synthetic cleanup stays confined to ADV-owned roots and the `0000000000000000` synthetic prefix; real project IDs and marker-mismatched current-run dirs are preserved.
- OpenCode DB path resolution must report the attempted path and fallback path when unavailable, not silently claim session debt health.
- Worktree WIP poisoned-history suppression must not delete, terminate, reset, or hide actual recovery evidence for candidate worktree-owner workflows.

## Scope

### In Scope

- `plugin/src/storage/store-temporal/index.ts` active-list / memo behavior.
- `plugin/src/storage/store-temporal-memo.ts` if summary completeness needs structural metadata.
- `plugin/src/tools/status.ts` status/hygiene reporting and recommendations.
- `plugin/src/utils/opencode-session-debt.ts` DB path resolution.
- `plugin/src/__tests__/global-setup.ts` and synthetic cleanup helpers/tests.
- `plugin/src/tools/worktree/state.ts` WIP/worktree poisoned workflow discovery behavior.
- Relevant specs/docs/tests for these contracts.

### Out of Scope

- Broad Temporal schema rewrite.
- Destructive recovery of existing poisoned workflows without separate operator approval.
- Changing the seven-gate ADV lifecycle.
- Cleaning non-synthetic user/project directories.

### Must Not

- Must not hide true poisoned-history evidence needed for operator recovery.
- Must not delete real ADV project state or non-synthetic worktrees.
- Must not rely on heuristic-only status correctness; fixes need structural tests.
- Must not make active-change visibility depend on prior read order in the current process.

## Agenda Sources

- `ag-wOFRzi_O` Fix incomplete active-change listing
- `ag-qXxybFRa` Fix synthetic ADV residue cleanup
- `ag-hMlQ_PKv` Fix OpenCode DB path resolution
- `ag-aWL1Yd3T` Reduce poisoned workflow WIP noise
