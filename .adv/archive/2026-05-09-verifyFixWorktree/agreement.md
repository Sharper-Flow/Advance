# Discovery Agreement

## Facts

- Issue #48 is open, high-priority bug, labeled `needs-verify`, and linked to this change.
- Prior issue comment notes R1 signal-driven refactor likely removed `WorkflowUpdateFailedError` from worktree mutation path by replacing workflow updates with signals.
- Current proposal is verify-first: reproduce on fresh/current trunk, only code-change if failure remains or errors are still generic.
- Project wisdom `pw-ebd56fd0-6dc4-4f34-938d-566642b9fd59` records first-authority pattern for worktree create recovery: use `git worktree list --porcelain` before Temporal registry access; existing branch/path reuse can complete without project-workflow recovery.

## Decisions

- Treat this as verification-first due `needs-verify`; avoid churn if current behavior is already fixed.
- If failure reproduces, improve semantic error reporting and add regression coverage for repaired/no-registry create/resume path.
- If not reproduced, collect concrete verification evidence sufficient for acceptance/closure.

## Risks / Unknowns

- Worktree operations mutate git/worktree state; tests should prefer temp repos or tool-mediated safe paths.
- Live ADV tool behavior may depend on built dist and current OpenCode session cache.

## Out of Scope

- Broad worktree lifecycle redesign.
- Bypassing merge-before-delete safety.
- Manual direct edits to external ADV state.