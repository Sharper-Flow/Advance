## Validated Design

Independent validator verdict: CAUTION. Refinements accepted below.

### #37 Checkpoint / ledger recovery
- Work in `plugin/src/tools/checkpoint.ts` and task-run ledger tests.
- On clean-tree checkpoint entry, read task-run phase.
- If phase is already `checkpointed`, return `checkpointRecorded:true` idempotently without re-recording.
- If a previous dirty-tree checkpoint commit succeeded but ledger recording failed, retry sees clean tree at the commit SHA; record with committed semantics (`status:"committed"`, current SHA) rather than misleading `status:"clean"` where feasible.
- If ledger write still fails, keep `checkpointRecorded:false` and structured remediation; never silently mark ledger recorded.

### #33 Worker health diagnostics/status
- Work in `plugin/src/tools/temporal-ops.ts`, `plugin/src/temporal/health-probe.ts`, and tests.
- Prefer queue/poller/serviceability evidence over stale local registry/lock views when they conflict.
- Gate stale-queue warnings/status output on serviceability so server-poller/combined serviceable queues do not surface stale-queue false alarms.
- Keep genuine unserviceable/stale-lock warnings.

### #36/#38 Worktree cleanup
- Work in `plugin/src/tools/worktree/index.ts`, `plugin/src/utils/branch-integration.ts` or a new adjacent helper, and worktree tests.
- Add routing before the existing ADV integration gate:
  1. Missing-from-disk and git artifacts absent/reachable -> remove registry, skip disk inspection.
  2. Registry has `changeId` -> existing ADV integration gate: archived + merged + clean.
  3. Registry lacks `changeId` -> new non-ADV gate: clean + branch reachable from default; no archive requirement.
- Keep existing `verifyBranchIntegration` contract intact where possible.
- Keep `force` narrow; never bypass dirty/unmerged safety.

### Verification
- Red targeted tests for #33/#36/#37/#38.
- Green implementation.
- Run focused tests, `pnpm run check`, and `pnpm run build`.