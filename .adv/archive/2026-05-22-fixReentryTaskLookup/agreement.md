# Agreement

## Objectives

1. Make task-id-only lookup resilient when the task exists in workflow state but is absent from the reverse index or disk projection.
2. Populate the reverse task index whenever cached workflow state contains tasks.
3. Keep direct workflow state as the source of truth; avoid heuristic/prose matching.
4. Verify with regression tests and full repo checks.

## Acceptance Criteria

1. `adv_task_show` can resolve a task that exists only in live workflow task state for an active change.
2. `adv_task_update` can resolve and mutate that same task without requiring a prior disk projection refresh.
3. Task cache/index population occurs structurally from workflow state, not from parsing chat/tool output.
4. Existing indexed and disk-backed task lookup tests still pass.
5. `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.

## Constraints

- Do not add direct ADV state-file reads.
- Do not make archived/closed task lookup scan broad terminal history by default.
- Preserve target_path routing semantics for task tools.
- Task resolution fallback must be read-only until the caller explicitly performs its requested mutation.

## Sign-Off

User asked to resume remaining crash-recovery follow-ups.