## Objectives
- Make ADV worktree registry entries carry owning change id for canonical `change/<id>` branches.
- Keep delete safety strict: archived + merged + clean remains required.
- Improve triage so registry records with missing `changeId` are visible and actionable.

## Acceptance Criteria
1. All ADV worktree registration paths for canonical `change/<id>` branches record `changeId: "<id>"` unless an explicit change id is supplied.
2. Delete integration verification no longer returns `branch_not_in_registry` for registry records that have inferred/recorded change id and archived summaries.
3. Triage emits a distinct orphan/drift class for registry entries under `change/...` that are missing change id.
4. Focused tests cover create registration, inline/forked/migration registration surfaces as practical, branch integration, and triage missing-change-id behavior.
5. `pnpm run check`, relevant tests, and build pass from `plugin/`.

## Constraints
- Do not weaken branch integration safety.
- Do not mutate or delete existing stale worktrees/registry entries as part of this fix.
- Do not add broad repair flow unless needed for tests; triage surfacing is enough for existing drift.