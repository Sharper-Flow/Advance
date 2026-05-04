# Proposal: Clean Up ADV Foldering Debt

## Why

ADV's external-state and worktree foldering has drifted from its intended contract. The design is sound — project-id-keyed external state plus per-branch worktrees — but execution gaps create silent disk growth, layout bugs, duplicate archive listings, and inconsistent path semantics.

## What Changes

1. Flatten external-state layout (F1): add `ProjectPaths.reflections`; resolve `{ext}/reflections.jsonl`; migrate `{ext}/.adv/reflections.jsonl` safely.
2. Test-state isolation and cleanup (F2): add Vitest cleanup via `globalSetup`/teardown; auto-clean current-run synthetic artifacts; dry-run pre-existing leaked dirs first.
3. Reap empty worktree parents (F3): after `git worktree remove`, remove empty branch-prefix parents until the per-project root.
4. Retire/deprecate `db/` path (F4): remove physical `ProjectPaths.db` allocation; keep `db_dir` only as deprecated compatibility if needed.
5. Make worktree base XDG-compliant (F5): preserve `$XDG_DATA_HOME/opencode/worktree/{pid}/{branch}` sibling shape; add `getWorktreeBase(projectId)`.
6. Tree-wide hygiene (F8): report synthetic-prefix counts and current-project dead artifacts read-only.
7. Path-guard parity (F7): central guard for absolute, namespace-safe XDG-derived paths.
8. Canonical archive listing de-dupe (F9): de-dupe archived listings by `change.json.id`, not archive directory name; handle `{date}-{changeId}` bundle dirs.

## Success Criteria

1. `getReflectionsPath` resolves to `{ext}/reflections.jsonl` for external stores; no `.adv/` segment is created under `{ext}/`.
2. Running `pnpm test` from a clean synthetic-state baseline leaves zero net synthetic-prefix dirs after the run completes.
3. Existing synthetic-prefix and dead-artifact cleanup is dry-run first and requires explicit approval before deletion.
4. After `worktree_delete change/foo`, the parent `worktree/{pid}/change/` is removed if empty.
5. `getProjectPaths()` no longer exposes or allocates a physical `db` path; `db_dir` remains only as deprecated config compatibility if retained.
6. Worktree paths respect `XDG_DATA_HOME` while preserving current sibling layout under `opencode/worktree/{pid}`.
7. Hygiene output reports synthetic-prefix counts and current-project dead artifacts without mutating disk.
8. Path guards reject relative or namespace-escaping XDG roots.
9. `adv_change_list status:"archived"` returns one row per canonical archived change id, with no duplicate rows caused by archive bundle directory names.
10. Existing tests pass; new tests cover each invariant above.

## Scope

### In Scope
F1, F2, F3, F4, F5, F7, F8, F9; dry-run detection/reporting; XDG-compliant worktree helper preserving sibling layout; regression tests.

### Out of Scope
- `worker.lock.releasing` lifecycle (owned by `fixZombieWorkerLockTemporal`).
- Moving worktrees under `plugins/advance/{pid}/worktrees`.
- Auto-deleting pre-existing user disk artifacts without explicit approval.
- Changes to in-repo `.adv/specs/` semantics.

## Discovery Findings

User decisions: dry-run first; XDG-only worktree compatibility; include F9.

LBP checks: XDG official spec requires `$XDG_DATA_HOME` semantics and absolute env paths; Vitest official docs support `globalSetup`/teardown; internal best practice is one resolver per storage domain, dry-run-first cleanup, canonical-id de-dupe at read boundaries.

Prior work cited: `unifyworktreeunderadvmultisess`, `repairtemporalmigrationdebt`, `addagentmeshandinrepoarchive`, `temp/proposal-retireLegacyStorageBackend.md`.

AMBIGUITY ANALYSIS: no blocking findings. Coverage: `B:C F:C S:C M:C D:C X:N/A Q:C I:C E:C C:C T:N/A`.
