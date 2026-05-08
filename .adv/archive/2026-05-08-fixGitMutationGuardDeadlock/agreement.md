## Agreement

### Objectives

1. Allow `git stash`, `git checkout`, `git switch` on dirty default branch (recovery commands)
2. Strip heredoc content before command classification to prevent false positives
3. Keep destructive mutations (`commit`, `add`, `push`, `merge`) blocked on dirty default branch

### Acceptance Criteria

- AC1: `evaluateDecision("STAGING", dirtyDefaultCtx, "stash")` returns ALLOW
- AC2: `evaluateDecision("UNKNOWN", dirtyDefaultCtx, "checkout")` returns ALLOW
- AC3: `evaluateDecision("UNKNOWN", dirtyDefaultCtx, "switch")` returns ALLOW
- AC4: `evaluateDecision("MUTATION", dirtyDefaultCtx, "commit")` still returns BLOCK
- AC5: `evaluateDecision("STAGING", dirtyDefaultCtx, "add")` still returns BLOCK
- AC6: `evaluateDecision("MUTATION", dirtyDefaultCtx, "push")` still returns BLOCK on default branch
- AC7: Heredoc content like `cat <<'EOF'\ngit commit -m "x"\nEOF` does not trigger mutation classification
- AC8: All existing git-guard tests pass unchanged

### Constraints

- Files: `plugin/src/tools/git-guard.ts`, `plugin/src/tools/git-guard.test.ts` only
- No changes to decision matrix for destructive mutations
- Recovery commands only allowed on default branch (not non-worktree feature branches)

### Out of Scope

- Bun sandbox path allowlisting
- Worktree creation/detection changes
- Changes to ADV command files