# Archive: Fix audit hygiene

**Change ID:** fixAuditHygiene
**Archived:** 2026-05-23T02:10:58.961Z
**Created:** 2026-05-23T00:11:18.645Z

## Tasks Completed

- ✅ Fix active-change list completeness and task counts
  > Removed the memo-only early return from listResolvedChanges so active lists always use the memo + visibility + disk ID union and hydrate per-change state. Added regressions proving warmed memo entries do not hide disk-visible active changes and completed-task counts are not flattened to 0/0.
- ✅ Harden synthetic ADV residue cleanup
  > Changed synthetic cleanup to consider all `0000000000000000*` dirs under ADV-owned project/worktree roots rather than only post-baseline dirs, preventing crashed-run residue from becoming permanent. Preserved marker-mismatch protection and real project ID preservation with tests.
- ✅ Fix OpenCode DB path resolution diagnostics
  > Changed OpenCode DB path resolution to return structured path metadata. Absolute OPENCODE_DB remains honored; missing relative OPENCODE_DB resolves explicitly and falls back to the canonical OpenCode DB when present, with diagnostics surfaced. Updated session doctor caller for the new return shape.
- ✅ Narrow worktree WIP poisoned workflow discovery
  > Narrowed active worktree discovery visibility query with `AdvWorktreeBranches IS NOT NULL`, so WIP scans query likely worktree owners instead of every non-terminal change. Added tests for query construction/use and preserved existing poisoned-history handling for owner workflow query failures.
- ✅ Run full verification and live hygiene checks
  > Ran full verification after implementation tasks. Fixed a Prettier finding in state-session-lifecycle.test.ts, reran check successfully, ran full test suite and build successfully, and verified synthetic hygiene counts are zero in current environment.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** When validating a single test file via package scripts, confirm the script forwards args. `pnpm test -- <file>` in this repo can still execute broader suites; use `npx vitest run <file>` for precise targeted evidence.
