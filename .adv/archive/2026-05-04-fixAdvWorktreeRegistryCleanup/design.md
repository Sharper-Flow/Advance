## Design
Validator verdict: VALIDATED with required adjustments.

### Core helper
- Add `inferChangeIdFromBranch(branch: string): string | undefined` for canonical ADV branch names only.
- Return suffix for `change/<id>` when suffix is non-empty.
- Return `undefined` for non-`change/` branches and empty `change/`.

### Registration fixes
Populate `changeId` in all worktree registry write paths, not just primary create:
- `advWorktreeCreate` registration in `plugin/src/tools/worktree/index.ts`.
- Inline-mode registration path in `plugin/src/tools/worktree/index.ts`.
- Forked-session registration path in `plugin/src/tools/worktree/index.ts`.
- Legacy migration `addSession` path in `plugin/src/tools/worktree/migration.ts`.
- Direct `addGitCensusWorktree` workflow update in `plugin/src/tools/worktree/migration.ts`.

Prefer explicit change id if a call path has one; otherwise infer from branch.

### Safety gate
- Keep `verifyBranchIntegration()` strict.
- Do not relax `branch_not_in_registry` or missing-change-id failures.

### Triage
- Add `registry_missing_change_id` orphan/drift class for registry entries where `branch` starts with `change/` but `changeId` is absent.
- Recommended fix should be diagnostic/actionable, not unsafe deletion. For v1: recommend repairing/adopting registry metadata or manual safe cleanup after archived+merged+clean verification.

### Tests
- Red/green tests for helper behavior.
- Worktree create/register calls include inferred change id.
- Branch integration passes when registry includes change id and archived+merged+clean deps pass; existing missing-change-id test remains fail-closed.
- Triage reports `registry_missing_change_id`.
- Focused worktree/branch integration tests plus full `pnpm run check`, `pnpm test`, `pnpm run build`.