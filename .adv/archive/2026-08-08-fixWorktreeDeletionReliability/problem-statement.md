# Problem Statement

`adv_worktree_delete` cannot reliably clean valid project worktrees. Cross-project calls can exceed the host 10-second tool ceiling before the tool's own timeout starts, and non-`change/*` worktrees such as release remediation branches are rejected when absent from ADV's registry even though Git still owns and exposes them. This leaves merged worktrees on disk and makes cleanup outcome dependent on timing and registry history rather than current Git state.

## Observable failure

- `adv_worktree_delete dryRun:true` against retained release worktrees returned generic `ToolExecutionTimeout` after 10 seconds.
- Reruns can return quickly, proving timing-dependent behavior rather than a deterministic safety refusal.
- Valid clean merged `release/*` worktrees return `INTEGRATION_REQUIRED: branch_not_in_registry`, so the existing deletion path cannot remove them without unsupported manual Git cleanup.
- The wrapper's typed 8-second timeout does not cover target-project resolution/store initialization and does not cancel inner work.

## Impact

Merged worktrees accumulate indefinitely. Operators cannot distinguish a safe timeout from an operation still running in the background. Registry loss or nonstandard-but-valid branch names prevent cleanup even when Git can prove branch identity, cleanliness, process non-use, and default-branch integration.