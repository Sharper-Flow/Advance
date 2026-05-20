# Problem Statement: Inline ADV worktree execution has wrong OpenCode session root

## Observed Symptom

During ADV work in OpenCode, file creation/edit output can render as:

```text
# Created ../../../.local/share/opencode/worktree/bdf259aa162ae192af5b18899ccdc653b085528d/change/gateTrunkFirewall/plugin/src/trunk-write-firewall-spec-assets.test.ts
```

## Diagnosis

ADV correctly stores worktrees under `$XDG_DATA_HOME/opencode/worktree/{project-id}/{branch}`. The awkward path appears because OpenCode's file tooling computes relative paths from `instance.worktree`, which remains the trunk checkout in inline mode, while ADV directs edits into the external worktree via tool `workdir` or absolute paths.

This mismatch affects more than display: permission patterns, diagnostics, LSP roots, formatter discovery, and other file-tool metadata may remain trunk-rooted while the actual target files are in the ADV worktree.

## Needed Outcome

ADV mutating work inside a worktree must execute with a native OpenCode context rooted at that worktree, or ADV must avoid inline mutation and launch/use a worktree-scoped OpenCode session. The storage location should remain XDG-compliant; the root/context mismatch is the issue.