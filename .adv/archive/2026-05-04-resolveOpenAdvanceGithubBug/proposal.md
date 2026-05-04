# Resolve Open Advance Bug Queue

## Why

Four open GitHub issues belong to Advance and block reliable ADV operation:

- #33: `adv_temporal_diagnose` reports worker dead while process/poller evidence indicates serviceability.
- #37: `adv_task_checkpoint` can commit successfully but fail to record task-run ledger state; retry on a clean tree must be safe and recoverable.
- #36: `adv_worktree_delete` cannot clear `missing_from_disk` registry entries after manual safe cleanup.
- #38: `adv_worktree_delete` blocks cleanup for clean, merged non-ADV worktree branches.

## Discovery Evidence

- `checkpoint.ts` already has clean-tree ledger recording and partial-success output; #37 needs phase-aware retry semantics so a committed checkpoint is not recorded as a clean checkpoint after a partial failure.
- `branch-integration.ts` requires `changeId` and archived status for every registered branch; this explains #38.
- `worktree/index.ts` runs integration before absent-path cleanup; this explains #36.
- `temporal-ops.ts` combines lock/process/poller/project-workflow evidence; #33 also touches `health-probe.ts` stale-queue/status composition.

## Success Criteria

- [ ] #37 clean-tree checkpoint retry records/recover checkpoint metadata or returns structured actionable git-vs-ledger status.
- [ ] #33 diagnose/status avoids dead-worker/stale-queue false negatives when serviceable evidence exists.
- [ ] #36 stale missing-from-disk registry entries can be cleared safely/audited.
- [ ] #38 clean merged non-ADV worktree branch deletion succeeds without archived ADV change.
- [ ] Dirty, unmerged, or active/unarchived ADV deletion remains blocked.
- [ ] Regression tests cite #33, #36, #37, #38.
- [ ] `pnpm run check`, targeted tests, and `pnpm run build` pass from `plugin/`.