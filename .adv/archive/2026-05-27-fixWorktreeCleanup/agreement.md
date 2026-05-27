# Agreement

## Objectives

1. Make post-delete worktree workflow/cache notification locally bounded and warning-bearing, without treating notification failure as git removal failure.
2. Make queued pending-delete cleanup locally bounded per item so one stuck item cannot block later cleanup work.
3. Preserve all destructive safety gates: dirty work, in-use worktrees, unmerged branches, non-terminal change branches, hooks, and force semantics.
4. Clarify `/adv-cleanup` worktree behavior as report-only, including under `--execute`.
5. Add spec law and tests so bounded cleanup remains machine-checkable.

## Acceptance Criteria

- AC1: Post-delete notification/cache refresh is bounded; git worktree removal remains authoritative; timeout returns success with warning.
- AC2: Pending-delete cleanup is bounded per item; timed-out item is retained, actual failed/timeout attempts increment, and later queued items continue.
- AC3: In-use skips do not consume retry attempts; actual failed deletes and timeouts do.
- AC4: Already-missing pending-delete paths are cleared without retrying forever.
- AC5: Pending-delete retry cap is enforced at max 5 attempts unless an explicit operator cleanup uses force-attempt semantics.
- AC6: `/adv-cleanup` reports worktree drift groups and does not delete worktrees, even with `--execute`.
- AC7: Spec/docs/tests reflect the bounded cleanup law and full verification passes.

## Constraints / Avoidances

- Do not force-delete dirty, in-use, unmerged, non-terminal, or otherwise unsafe worktrees.
- Do not make `/adv-cleanup` perform destructive worktree deletion.
- Do not rely on global MCP/tool timeouts as the only correctness boundary.
- Runtime tool behavior still requires rebuild/deploy and fresh OpenCode session because plugin tool code is cached.
