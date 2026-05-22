# Problem Statement

`adv_gate_complete` can hit the worktree guard using the OpenCode host process cwd instead of the target ADV worktree path. When the session process cwd is the main checkout, even a `target_path` retry from the worktree is blocked as if it were still running from trunk.

For auto-managed changes, this can also surface internal runtime wiring failures (for example `resumeRuntime missing`) instead of the intended auto-manage behavior: resume/materialize the change worktree, then block main-checkout mutation with `WorktreeIsolationViolation` and `expectedWorktreePath`.

Separately, the runtime still exposed legacy standalone worktree aliases next to canonical `adv_worktree_*` tools, creating two visible worktree tool families.