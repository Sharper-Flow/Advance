GitHub issue: https://github.com/Sharper-Flow/Advance/issues/48

`adv_worktree_create` / `adv_worktree_resume` can fail with generic `WorkflowUpdateFailedError` despite healthy Temporal diagnostics and clean post-repair state. This blocks ADV apply because trunk guard requires worktree isolation.