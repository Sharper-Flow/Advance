# Contract Traceability

**Change ID:** addReplayReportBounds
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-13T04:39:43.312Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Three controlled exported history/metadata pairs committed with branch-specific provenance; reviewer READY. |
| AC2 | acceptance_criterion | pass | test | replay-determinism registry runs all four histories through Worker.runReplayHistory; targeted suite passed. |
| AC3 | acceptance_criterion | pass | test | Reducer tests prove FIFO retention of newest 200 distinct IDs and cumulative total. |
| AC4 | acceptance_criterion | pass | test | Tests prove duplicate no-op and sidecar-backed duplicate protection after FIFO eviction. |
| AC5 | acceptance_criterion | pass | test | CAN round-trip, schema/check, workflow bundle, replay, and targeted verification all passed. |
| C1 | constraint | respected | static_check | Metadata records controlled Temporal workflow export provenance; reviewer verified no hand-authored history. |
| C2 | constraint | respected | static_check | Review found no new patch marker, command-producing API, Map/Set, or nondeterministic structure. |
| C3 | constraint | respected | static_check | Reviewer verified report-key, signals/queries, handler drain, CAN threshold, and caps unchanged. |
| C4 | constraint | respected | static_check | Implementation uses exact 200-item FIFO-plus-total shape with regression coverage. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No snapshot/projection clone or benchmark work. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No ready-task or readiness performance change. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No aggregate-cap, threshold, handler, signal/query, or patch redesign. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-86e9bd603c47 | AC1, AC2 |  | C1, C2, C3 |  |
| tk-6a69a5e89523 | AC3, AC4, AC5 |  | C2, C3, C4 |  |
| tk-ceae6f3a6166 |  | AC1, AC2, AC3, AC4, AC5 | C1, C2, C3, C4 |  |
