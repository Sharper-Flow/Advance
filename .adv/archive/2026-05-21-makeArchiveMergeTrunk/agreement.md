# Agreement

## Objectives

- Enforce release finalization structurally, not only via markdown instructions.
- Preserve worktree isolation: archive artifacts are written to and committed from the change worktree.
- Keep failed finalization retryable: do not retire the active change or close issues when merge/push/handoff blocks.
- Support explicit PR-mode opt-out without falsely reporting a local merge.

## Acceptance Criteria

1. Release gate rejects direct-mode completion without default-branch reachability.
2. Release gate rejects PR-mode completion without pushed-branch handoff evidence.
3. Archive tool validates worktree path before writing in-repo archive artifacts.
4. Archive tool finalizes before archived status transition and issue closure.
5. Git helper tests and tool/gate behavior tests cover clean direct merge, dirty main, PR handoff, blocked finalization, and phase9 skip semantics.
6. Full check/test/build passes.

## Constraints

- No automatic stash or branch switching.
- No auto conflict resolution.
- No force push.
- Preserve existing archive bundle format.
