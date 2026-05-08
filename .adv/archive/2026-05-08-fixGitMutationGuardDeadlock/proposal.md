## Problem

Git mutation guard blocks all git operations on dirty default branch with no override. When worktree paths are inaccessible (Bun sandbox restriction), changes are stranded with no commit path.

## Proposed Solution

### Fix 1: Allow recovery commands on dirty default branch

`stash`, `checkout`, and `switch` are non-destructive recovery operations. Allow them on dirty default branch so the agent can:
- `git stash` to save work before switching branches
- `git switch`/`git checkout` to move to the change branch

Implementation:
- Add `RECOVERY_SUBCOMMANDS` set containing `stash`, `checkout`, `switch`
- Classify these as new `RECOVERY` category
- In `evaluateDecision`: allow `RECOVERY` on dirty default branch

### Fix 2: Don't inspect content inside heredocs

The `splitCommand` function splits on `;`, `&&`, `||`, `|` — which catches git commands inside heredoc bodies and quoted script content. Strip heredoc content before classification.

## Success Criteria

- `git stash` allowed on dirty default branch
- `git checkout`/`git switch` allowed on dirty default branch
- Heredoc content containing git commands doesn't trigger guard
- `git commit`/`git add`/`git push` still blocked on dirty default branch
- All existing tests pass, new tests cover recovery commands and heredoc stripping

## Out of Scope

- Bun sandbox path allowlisting (separate issue)
- Changes to worktree creation or detection