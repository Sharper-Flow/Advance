# Contract Traceability

**Change ID:** fixCompletionSemantics
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | checkpoint.ts fireTaskCompletedFromCheckpoint returns recorded:false on signal/query failure or mismatch; checkpoint.test.ts covers Temporal unavailable, committed signal failure, clean-tree signal failure, and status/verification/checkpointSha/filesTouched mismatches. Verification: targeted suite 55 tests passed. |
| AC2 | acceptance_criterion | pass | test | .opencode/command/adv-apply.md requires checkpointRecorded:true and treats false as blocking; task.ts rejects normal adv_task_update status:'done' with TASK_DONE_REQUIRES_CHECKPOINT. task.test.ts covers the guard. |
| AC3 | acceptance_criterion | pass | test | change-state.ts preserves stronger checkpoint metadata against weaker duplicate taskCompletedSignal; workflows.signal-handlers.test.ts verifies duplicate signal preserves verification, summary, filesTouched, touched_files, checkpointSha, completedAt. |
| AC4 | acceptance_criterion | pass | test | task.ts documents adv_task_update done as non-canonical; taskTools no longer exposes adv_task_completed; task.test.ts asserts adv_task_completed is undefined and adv_task_update done rejects normal completion. |
| AC5 | acceptance_criterion | pass | test | ADV_INSTRUCTIONS.md, adv-apply.md, docs/specs/advance-delivery.md, docs/specs/tdd-contract.md, .adv spec JSON, and task output comments align: adv_run_test is executable run evidence; durable final proof is taskCompletedSignal.verification via checkpoint. |
| AC6 | acceptance_criterion | pass | test | docs/temporal-telemetry-posture.md documents existing health/diagnostic/counter surfaces and explicit non-goals: no Prometheus, OpenTelemetry, persistent metrics DB, or cross-session aggregation. package checks show no new telemetry dependency. |
| C1 | constraint | respected | static_check | Mutations remain taskCompletedSignal/taskUpdatedSignal through existing signal path; no update-based change-workflow mutation was added. |
| C2 | constraint | respected | static_check | No defineUpdate was introduced on change workflows; workflow-bundle guard remains covered by targeted workflow tests and pnpm run check. |
| C3 | constraint | respected | static_check | Completion flow simplified to one normal path: adv_task_checkpoint. Telemetry is documented, not expanded with infrastructure. |
| C4 | constraint | respected | static_check | Regression tests cover checkpoint false returns, canonical done guard, tool removal, metadata preservation, and query wrapper. Targeted suite passed: 55 tests. |
| C5 | constraint | respected | static_check | Design resolved completion ownership and telemetry shape: checkpoint owns normal completion; telemetry posture is minimal documentation/health alignment. |
| DONT1 | avoidance | respected | review | checkpointRecorded:false plus recordingError/remediation is returned when workflow recording fails after successful git checkpoint; tests cover committed and clean-tree paths. |
| DONT2 | avoidance | respected | review | adv-apply, ADV_INSTRUCTIONS, specs, and task comments consistently point to checkpoint completion and final verification on taskCompletedSignal; adv_task_completed is not exposed. |
| DONT3 | avoidance | respected | review | Correctness is structural: tool guard rejects non-canonical done, checkpoint verifies workflow state by query, state reducer preserves stronger metadata, tests lock edge cases. |
| DONT4 | avoidance | respected | review | No Prometheus/OpenTelemetry dependency or metrics endpoint was added; telemetry posture explicitly defers platform expansion until a concrete diagnostic gap exists. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Full observability platform integration was not implemented. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No broad Temporal workflow rewrite was performed; change is focused on checkpoint/tool/state semantics. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Gate sequencing and non-task lifecycle semantics were not changed. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Prometheus/OpenTelemetry integration was not introduced; telemetry doc says current surfaces are sufficient. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d4f88ac07a84 | AC1, AC2 | AC1 | C1, C2, C4, DONT1, DONT3 |  |
| tk-55045e2bfe71 | AC3, AC4 | AC3, AC4 | C1, C2, C3, C4, DONT2, DONT3 |  |
| tk-b9daa8c7a6c7 | AC3 | AC3 | C1, C2, C4, DONT3 |  |
| tk-516a6abfd9d0 | AC2, AC5 | AC2, AC5 | C3, C4, DONT2 |  |
| tk-381148659d4d | AC6 | AC6 | C3, DONT4, OOS1, OOS4 |  |
