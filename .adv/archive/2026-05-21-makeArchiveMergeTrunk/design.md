# Design

## Runtime enforcement

- `plugin/src/tools/archive-helpers/git-finalize.ts` centralizes Phase 9 git behavior.
- `adv_gate_complete release` enforces final release evidence:
  - direct mode: `change/{id}` must be reachable from the default branch;
  - PR mode: `change/{id}` must be published to origin for PR workflow handoff.
- `adv_change_archive` validates any supplied `worktreePath` before archive writes and requires a trusted change worktree when `phase9: "run"`.

## Archive ordering

1. Validate gates through acceptance; release may be pending only when Phase 9 will run.
2. Validate worktree path before selecting `.adv/archive` output path.
3. Write archive bundle/spec docs.
4. Commit `.adv/` archive artifacts on the change branch.
5. Run direct merge/push or PR-mode pushed-branch handoff.
6. If finalization blocks, return top-level failure and leave the change active.
7. Only after successful/accepted finalization: transition archived state, cleanup source projection, and close linked issues.

## Git finalization helpers

- Prefer `origin/HEAD`, then `init.defaultBranch`, then local `main`/`trunk` for default-branch detection.
- Verify main checkout branch and cleanliness.
- Verify/merge change branch with `git -C "$MAIN" merge --ff-only change/{id}`.
- Push default branch in direct mode unless skipped/disabled.
- Push change branch in PR mode and report `pr_pushed`.
- Redact credential-like git output before surfacing errors.

## Tests

Behavior-level tests cover helper behavior, archive-tool ordering and blocked finalization, release-gate enforcement, config defaults, and worktree pending-delete isolation.