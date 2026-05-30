# Fix worktree cleanup

## Intent

Fix worktree cleanup paths that can hang after git worktree deletion or while draining queued pending deletes.

## Scope

- `plugin/src/tools/worktree/index.ts`
- `plugin/src/tools/worktree/index-delete.test.ts`
- `.adv/specs/worktree-lifecycle/spec.json`
- `docs/specs/worktree-lifecycle.md`
- `.opencode/command/adv-cleanup.md`
- `skills/adv-cleanup/SKILL.md`
- Contract/asset tests for cleanup and spec mirrors

## Success Criteria

- Worktree delete remains successful after git removal even when workflow/cache notification times out; warning is surfaced.
- Pending-delete cleanup bounds each queued item, retains timed-out items, increments only actual failed/timeout attempts, and continues to later items.
- Dirty, in-use, unmerged, non-terminal, and non-ADV safety gates remain intact.
- Missing pending-delete paths are cleared safely.
- Retry cap is structurally documented and enforced at max 5 attempts, with manual force-attempt escape for operator cleanup.
- `/adv-cleanup --execute` remains report-only for worktree drift.
- Tests, lint/typecheck/format, build, and strict validation pass.
