# Temporal Workflow Hot-Path Assessment

## Outcome

ADV’s Temporal change workflow follows the supported durable-workflow pattern. No workflow correctness rewrite or performance optimization is warranted in this change. Deliverable: evidence-backed follow-up map.

## Evidence Map

- **Projection serialization — performance:** `plugin/src/temporal/workflows.ts:717-718`, `snapshotState()`. Correct/deterministic; benchmark before changing.
- **Signal fan-out — performance:** `workflows.ts:1213-1654`, `scheduleChangeProjection()` at `720-770`; `search-attributes.ts:175-239`. Measure before optimization.
- **Ready tasks — performance:** `plugin/src/temporal/change-state.ts:1498-1524`, `getReadyTasksFromChangeState()`. Candidate for deterministic indexing.
- **Idempotency ledger — growth:** `change-state.ts:1031-1060` and CAN seed carry-forward at `workflows.ts:1723`; `seenReportIds` is unbounded.
- **Replay safety — coverage:** `workflows.ts:895-922,962,975,990`; `replay-determinism.test.ts:21-35` has incomplete committed-history coverage.
- **Gate readiness — performance:** `gate-readiness.ts:799-1107`; `workflows.ts:955-1209`. Candidate only after measurement.
- **Continue-as-new seed — growth:** `workflows.ts:1684-1733`; `types/artifacts.ts:96-110` is structurally guarded by payload caps.

## External Validation

- https://github.com/temporalio/sdk-typescript/blob/main/packages/workflow/src/workflow.ts
- https://github.com/temporalio/sdk-typescript/blob/main/packages/test/src/workflows/workflow-with-standard-api-usage.ts
- https://github.com/temporalio/sdk-typescript/blob/main/contrib/workflow-streams/README.md
- https://github.com/temporalio/sdk-typescript/blob/main/packages/test/src/test-replay.ts

Sources support existing patch-gated evolution, non-throwing signal rejection, handler drain before continue-as-new, and history bounding.

## Bounded Follow-Ups

1. **Replay coverage** — locations: `plugin/src/temporal/__tests__/replay-determinism.test.ts` and live patch branches in `plugin/src/temporal/workflows.ts:895-922,962,975,990`. Verify: committed histories exercised with `Worker.runReplayHistory`. Measurement required: **No**.
2. **Serialization measurement** — locations: `plugin/src/temporal/workflows.ts:snapshotState()` and `scheduleChangeProjection()`. Verify: representative and near-aggregate-cap benchmark plus workflow-isolate behavior check before any clone replacement. Measurement required: **Yes**.
3. **Idempotency growth** — locations: `plugin/src/temporal/change-state.ts:1031-1060` (`seenReportIds`) and `plugin/src/temporal/workflows.ts:1723` CAN seed carry-forward. Verify: duplicate-report rejection plus continue-as-new seed/cap test. Measurement required: **No**.
4. **Ready-task indexing** — location: `plugin/src/temporal/change-state.ts:getReadyTasksFromChangeState()` at `1498-1524`. Verify: deterministic readiness and transition tests. Measurement required: **No**.

## Acceptance Review

Independent review: READY. All seven categories, four official citations, bounded recommendations, and evidence-only boundary validated. Worktree clean; no product changes. Release hardening required this explicit AC4 clarification; no scope or implementation changed. Minor audit note: citations use Temporal SDK `main`; commit pinning remains optional future hardening.

## Boundary Statement

No Temporal workflow, reducer, cap, threshold, signal/query, patch-marker, telemetry, or configuration code changed. Replay determinism, handler behavior, size guards, continue-as-new drain, and workflow-bundle boundaries remain unchanged.