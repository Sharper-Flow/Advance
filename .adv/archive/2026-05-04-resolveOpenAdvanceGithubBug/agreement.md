## Objectives

1. Make checkpoint partial-success recovery explicit, idempotent, and safe.
2. Make worker diagnostics/status prefer stronger live serviceability evidence over stale local registry/lock/stale-queue views.
3. Make worktree cleanup handle safe missing-from-disk and clean merged non-ADV branch cases.
4. Preserve safety blocks for dirty, unmerged, or active/unarchived ADV branches.

## Acceptance Criteria

- AC1 (#37): Given a checkpoint commit already exists and the working tree is clean, retrying checkpoint records/recover checkpoint metadata or returns a structured actionable status that distinguishes git success from ledger failure.
- AC2 (#33): Given live worker/poller/serviceability evidence, `adv_temporal_diagnose` and status health do not report dead-worker/stale-queue state solely because weaker local evidence is stale or missing.
- AC3 (#36): Given a registry entry whose path and branch are gone, cleanup removes the stale registry entry when safe, with audit evidence when force is used.
- AC4 (#38): Given a non-ADV worktree branch that is clean and fully merged into default, deletion succeeds even without an archived ADV change.
- AC5: Given dirty, unmerged, or active/unarchived ADV branch state, deletion remains blocked with a specific reason.
- AC6: Regression tests fail before implementation and pass after implementation for all four issue classes.
- AC7: `pnpm run check`, targeted tests, and `pnpm run build` pass from `plugin/`.

## Out of Scope

- OpenCode-core snapshot service changes.
- OCA launcher/session UX.
- Replacing Temporal or worker lock architecture wholesale.
- Broad cleanup of unrelated zombie workflows.