# Acceptance

Reviewed at: 2026-07-13T04:39:43.312Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Add three committed replay-history/metadata pairs for `STATE_BACKED_GATE_ARTIFACT_PROOF_PATCH`, `ACCEPTANCE_EXECUTIVE_SUMMARY_PROOF_PATCH`, and `STATE_BACKED_ACCEPTANCE_PROOF_PATCH`; each records a reproducible source and a branch-specific coverage statement. | pass | Three controlled exported history/metadata pairs committed with branch-specific provenance; reviewer READY. |
| AC2 | acceptance_criterion | Extend `replay-determinism.test.ts` so every committed history is validated by `Worker.runReplayHistory`; existing legacy fixture coverage remains intact. | pass | replay-determinism registry runs all four histories through Worker.runReplayHistory; targeted suite passed. |
| AC3 | acceptance_criterion | `seenReportIds` retains only the 200 most-recent distinct report IDs in FIFO order, while `seenReportIdsTotal` tracks every accepted distinct report ID cumulatively. | pass | Reducer tests prove FIFO retention of newest 200 distinct IDs and cumulative total. |
| AC4 | acceptance_criterion | Duplicate report submission does not append, evict, or increment `seenReportIdsTotal`; sidecar-backed duplicate protection remains intact after FIFO eviction. | pass | Tests prove duplicate no-op and sidecar-backed duplicate protection after FIFO eviction. |
| AC5 | acceptance_criterion | Continue-as-new carries both retained IDs and cumulative total; transition, schema-generation, size-cap, workflow-bundle-boundary, and replay verification pass. | pass | CAN round-trip, schema/check, workflow bundle, replay, and targeted verification all passed. |
| C1 | constraint | Replay fixtures must come from a reproducible real or controlled Temporal test-workflow history exported with `temporal workflow show --output json --no-json-shorthand-payloads`, then sanitized and committed. Never fabricate event history. | respected | Metadata records controlled Temporal workflow export provenance; reviewer verified no hand-authored history. |
| C2 | constraint | The ID-bound is internal deterministic state only. Do not add a Temporal patch marker, command-producing API call, or nondeterministic data structure. | respected | Review found no new patch marker, command-producing API, Map/Set, or nondeterministic structure. |
| C3 | constraint | Preserve report-key byte format, existing signal/query contracts, handler drain, continue-as-new threshold, and payload caps. | respected | Reviewer verified report-key, signals/queries, handler drain, CAN threshold, and caps unchanged. |
| C4 | constraint | Mirror the established FIFO-plus-total shape; retain exactly 200 IDs. | respected | Implementation uses exact 200-item FIFO-plus-total shape with regression coverage. |
| OOS1 | out_of_scope | Snapshot/projection clone replacement or benchmark work. | not_applicable | No snapshot/projection clone or benchmark work. |
| OOS2 | out_of_scope | Ready-task indexing or other readiness performance changes. | not_applicable | No ready-task or readiness performance change. |
| OOS3 | out_of_scope | Aggregate-cap, continue-as-new threshold, handler, signal/query, or patch lifecycle redesign. | not_applicable | No aggregate-cap, threshold, handler, signal/query, or patch redesign. |

