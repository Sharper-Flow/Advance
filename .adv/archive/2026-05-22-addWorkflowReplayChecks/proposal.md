# Add workflow replay checks

## Why

ADV's Temporal-backed change workflows can become unreplayable after workflow-code deploys. The current incident is a real poisoned-history failure: `fixGateAutoWorktree` is archived in disk projection, but its Temporal workflow remains visible as `draft` and fails replay with `WORKFLOW_TASK_FAILED_CAUSE_NON_DETERMINISTIC_ERROR` / `[TMPRL1100]`.

This is not worker liveness. Restarting the worker restored queue health but did not repair the workflow. ADV needs structural replay checks, workflow-evolution policy, poison-tolerant WIP reads, and audited recovery semantics.

## Problem Statement

ADV should treat Temporal workflow logic as a versioned durable protocol. CI/release should block replay-incompatible workflow changes; command-producing workflow changes should use patching/versioning or an explicit recovery plan; poisoned/stale workflows should have audited recovery; and read paths such as `adv_wip_state` should isolate poisoned workflows while keeping healthy WIP visible.

## Success Criteria

- CI or equivalent local required check fails when the current workflow bundle cannot replay captured/sanitized ADV `changeWorkflow` histories.
- At least one replay fixture covers the observed `fixGateAutoWorktree` class: `[TMPRL1100] Nondeterminism error: UpsertWorkflowSearchAttributesMachine does not handle HistoryEvent(id: 182, ActivityTaskScheduled)`.
- Workflow-code changes that add/remove/reorder command-producing operations require `wf.patched`, Worker Versioning, or an explicit reset/recovery plan before archive; patch markers include a deprecation plan or rationale.
- `adv_wip_state` returns healthy active changes, healthy worktrees, and peer sessions even when one queried change workflow is poisoned.
- Poisoned workflows surface as structured warning items with `changeId`, workflow id when available, recovery reason, and evidence summary.
- Terminal/stale poisoned workflow recovery records exact evidence (`TMPRL1100`, `WorkflowTaskFailedCauseNonDeterministicError`, etc.) before any reset/terminate/disk-projection fallback.
- Docs/specs state worker restart alone is not a repair for nondeterministic history mismatch.
- Targeted tests plus `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.

## Scope

### In Scope

- Temporal replay-safety tests for `plugin/src/temporal/**` workflow definitions.
- Workflow versioning/patching/deprecation policy for command-producing workflow changes.
- Poisoned-history warning and audited recovery semantics.
- `listWorktreesAcrossChanges` and `adv_wip_state` resilience when individual workflow queries fail.
- Spec updates for `advance-workflow`, `backlog-coordination`, and `worktree-lifecycle`.
- Runbook updates in `docs/temporal-recovery.md`.

### Out of Scope

- Replacing Temporal.
- Manual Temporal DB surgery.
- Broad rewrite of all workflow handlers.
- Task-completion semantics owned by `fixCompletionSemantics` / `fixTaskCompletion`.
- Archive release ordering owned by `fixArchiveReleaseOrdering`, except documented interaction.
- Terminal/Warp navigation behavior.

### Must Not

- Must not rely on worker restart or retries as `TMPRL1100` repair.
- Must not hide healthy WIP because one workflow query fails.
- Must not terminate/reset/mutate poisoned workflows without exact evidence and audited approval boundary.
- Must not add heuristic-only replay checks; compatibility must be machine-verifiable.
- Must not reintroduce `defineUpdate` on change workflows.
- Must not weaken archive/worktree/claim safety checks.
