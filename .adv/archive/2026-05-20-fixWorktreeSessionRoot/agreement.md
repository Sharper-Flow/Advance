# Agreement: Fix worktree session root

## Objectives

1. Make ADV mutating worktree execution use the ADV worktree as the effective OpenCode root/context.
2. Preserve XDG-compliant external worktree storage.
3. Eliminate confusing escaped relative path output for worktree file edits.
4. Ensure related OpenCode file-tool behavior follows the same root: permissions, diagnostics, LSP, formatter discovery, and patch metadata.
5. Prefer structural correctness over cosmetic path rewriting.

## Acceptance Criteria

1. Given an ADV worktree at `$XDG_DATA_HOME/opencode/worktree/{project-id}/change/{change-id}`, when a file is created or edited during mutating ADV execution, OpenCode displays the path relative to that worktree.
2. Permission patterns for read/edit/write/apply_patch are generated relative to the ADV worktree, not the trunk checkout.
3. LSP diagnostics and formatter/root discovery operate against the worktree's project root for files edited in that worktree.
4. ADV does not move default worktree storage inside the repository.
5. If native inline context switching is unavailable or unsafe, ADV disables or bypasses inline mutation for the affected path and uses a worktree-scoped OpenCode session instead.
6. Regression tests cover the old escaped-path behavior or the root-context invariant that prevents it.

## Non-Goals

- Repo-local default worktree storage.
- Cosmetic-only path title rewriting as the primary fix.
- Hand-crafted symlinks, shell aliases, or environment-variable-only masking.
- Replacing the ADV worktree lifecycle or archive merge model.