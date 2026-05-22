# Design

## Architecture Overview

This change adds replay-safety and poisoned-read resilience around ADV's existing Temporal architecture. It preserves Temporal as live state authority and keeps `changeWorkflow` signal/query-only.

Two implementation surfaces:

1. **Replay/evolution lifecycle** — committed sanitized workflow-history fixtures plus a Vitest replay test using `Worker.runReplayHistory`; workflow command changes require replay coverage plus `wf.patched`, Worker Versioning, or explicit reset/recovery plan.
2. **Poison-resilient cross-change reads** — `listWorktreesAcrossChanges` isolates per-change workflow query failures, returns healthy partial worktree records, and feeds automation-first poison metadata into `adv_wip_state`; quarantine/read-only-first remains the default recovery posture.

## Key Decisions

### KD1 — Replay verification is a normal Vitest test

Add `plugin/src/temporal/__tests__/replay-determinism.test.ts`. It loads committed sanitized history fixtures and calls `Worker.runReplayHistory` against the current workflow bundle. A replay-incompatible command sequence fails the test and therefore `pnpm test` / CI.

### KD2 — Fixture covers the real poison class

Commit a sanitized `fixGateAutoWorktree` history fixture plus metadata recording event count, incident event id `182`, event type `EVENT_TYPE_ACTIVITY_TASK_SCHEDULED`, and the `[TMPRL1100]` nondeterminism signature. The fixture must remain static at runtime; sanitization happens before committing.

### KD3 — Use `wf.patched` for the current migration

The observed break is a command-order change in discovery gate readiness: legacy histories scheduled artifact inspection before search-attribute upsert, while current replay enforced a different branch. Add a targeted `wf.patched("discovery-contract-readiness-v1")` branch with rationale and deprecation guidance. Worker Versioning is deferred because this is a single OpenCode worker deployment, not a multi-worker fleet.

### KD4 — Poisoned workflow reads return partial structural results

Change `listWorktreesAcrossChanges` from a raw array/throwing path to a structured result: `records`, `warnings`, `poisonedWorkflows`, and `unavailable`. Each workflow query is isolated in its own try/catch; one poisoned workflow cannot hide healthy worktrees.

### KD5 — Reuse existing poison classifiers/probes

Tool-layer read paths use `workflowPoisonedDescriptionEvidence` plus existing `isPoisonedHistoryError`/`isWorkflowCompletedError` classification. Correctness comes from shared helpers and tests, not ad-hoc regex ownership in each caller.

### KD6 — `adv_wip_state` stays additive and backward-compatible

`adv_wip_state` normalizes both old array-returning worktree providers and the new structured worktree result. It adds `poisoned_workflows` while keeping existing `warnings`, `active_changes`, `worktrees`, and `sessions` behavior.

### KD7 — Recovery policy is read-only-first

Poison detection only surfaces metadata. It does not terminate, reset, reseed, archive, delete, or mutate workflows/worktrees. Destructive recovery remains a separate explicit-approval path with exact evidence such as `TMPRL1100`, `WorkflowTaskFailedCauseNonDeterministicError`, or `NonDeterministic`.

## Implementation Plan

1. Add replay fixture metadata/history and replay-determinism Vitest.
2. Add targeted discovery contract readiness compatibility patch and explicit gate-readiness enforcement option.
3. Add structured worktree list result types and per-change query isolation.
4. Add tool-layer describe probe and tests for poisoned evidence extraction.
5. Extend `adv_wip_state` with `poisoned_workflows` and preserved warnings.
6. Update replay/worktree/WIP/gate/spec tests.
7. Update specs, spec mirrors, and `docs/temporal-recovery.md`.

## Verification Strategy

- RED: replay exported `fixGateAutoWorktree` history before compatibility fix and observe `TMPRL1100` nondeterminism.
- GREEN: replay fixture passes after `wf.patched` compatibility branch.
- Worktree isolation test verifies healthy worktrees remain visible when a peer workflow query is poisoned.
- Backlog/WIP test verifies structured `poisoned_workflows` plus preserved warnings.
- Recovery probe tests cover missing/throwing `describe()`, poison marker extraction, non-poison output, and bounded evidence summaries.
- Full verification: targeted tests, `pnpm run check`, `pnpm run build`, full `pnpm test`, and strict `adv_change_validate`.

## Acceptance and Release Hardening Remediation

Acceptance review found one blocking issue: continue-as-new seed construction omitted `origin`, `worktree_auto_managed`, `target_worktree_path`, and `scope_worktrees`. The fix adds those fields and a regression test. Release hardening added a structural test that compares every declared `seedState` key in `contracts.ts` against the continue-as-new seed assignments in `workflows.ts`.

Release hardening also fixed docs/spec mirror gaps, classifier/probe alignment comments, patch-fixture linkage, `safeUpdateHandler` comments, backlog `top` semantics comments, and the temporal recovery runbook's active patch/evidence extraction references.

## Risks and Mitigations

- **Replay fixture staleness** — fixture metadata records the incident signature and is run by normal tests.
- **Patch marker permanence** — marker has inline and runbook deprecation rationale; retain until pre-contract histories are closed/archived and replay fixtures no longer need the migration path.
- **Poison metadata leakage** — evidence summaries are bounded and normalized.
- **Scope creep into destructive recovery** — this change is read-only-first; destructive recovery remains approval-gated and out of automatic read paths.

## Non-Goals

- Replace Temporal.
- Add manual Temporal DB surgery.
- Rewrite all workflow handlers.
- Change task-completion semantics or archive release ordering except documented interaction.
- Make terminal/Warp behavior part of correctness.
- Add external spec-conformance integration.
