# Contract Traceability

**Change ID:** improveAdvLatency
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-05-28T03:50:52.740Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/tools/status.test.ts: summary view does not invoke detailed-only providers; pnpm test passes. |
| AC2 | acceptance_criterion | pass | test | plugin/src/tools/status.ts blanks detailed formatted sections in summary view; plugin/src/tools/status.test.ts asserts summary formatted sections are empty; pnpm test passes. |
| AC3 | acceptance_criterion | pass | test | Session-debt confined to hygiene view; plugin/src/tools/status.test.ts 'confines OpenCode session debt to hygiene view' asserts confinement; summary recommendation removed. |
| AC4 | acceptance_criterion | pass | test | Default adv_change_list wired through listSummary (plugin/src/tools/change.ts); status summary skips detailed providers; manual benchmark shows summary ≈42ms vs health ≈115ms. |
| AC5 | acceptance_criterion | pass | test | plugin/src/storage/store-temporal/changes.test.ts 'serves memo-only candidates without per-change full hydration' passes; Visibility list query converged on AdvAffectedProjects in list-change-workflows.ts and visibility-claim-queries.ts. |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/test.test.ts shell-compatibility matrix (pipe semantics, timeout SIGTERM classification, max-buffer classification, non-zero exit, fresh execution) passes; substep telemetry recorded for adv_run_test. |
| AC7 | acceptance_criterion | pass | test | listSummary defers to authoritative path for archived/closed/content filters; adv_change_close/closeBatch + adv_gate_complete unchanged; adv_task_checkpoint still records evidence on done. |
| AC8 | acceptance_criterion | pass | test | plugin/src/utils/metrics.test.ts asserts recordToolDuration and recordPhaseDuration semantics; plugin/src/tools/status.test.ts 'records named adv_status phase durations' passes; plugin/src/tools/test.test.ts 'records adv_run_test substep telemetry phases' passes. |
| AC9 | acceptance_criterion | pass | test | plugin/scripts/bench-adv-latency.ts rewritten with disk substitute; smoke run captured at reports/latency-disk-final.md; docs/bench-adv-latency.md documents command/fixture/output. |
| AC10 | acceptance_criterion | pass | test | CI structural tests in plugin/src/tools/status.test.ts (provider non-invocation, slim formatted sections) and plugin/src/storage/store-temporal/changes.test.ts (no per-change hydration); manual Temporal benchmark via bench-adv-latency.ts mode=temporal documented. |
| AC11 | acceptance_criterion | pass | test | Full `pnpm test` suite passes; pnpm run check passes; no spec-law/cache-refresh/worktree/TDD/gate test regressed. |
| C1 | constraint | respected | static_check | Temporal store backend unchanged; createStore still requires temporalBundle; visibility filter switched but stays on registered Temporal search attribute. |
| C2 | constraint | respected | static_check | No Zod schema removed; preflight/validator paths untouched. |
| C3 | constraint | respected | static_check | Gate completion, archive, task checkpoint, TDD evidence semantics unchanged; adv_run_test contract preserved. |
| C4 | constraint | respected | static_check | listSummary explicitly hands off to authoritative listResolvedChanges for archived/closed/content-filter callers; cached metrics expose data via read-only health view. |
| C5 | constraint | respected | static_check | advWorktreeCleanup removed from summary; no read-only tool mutates state. Bench writes only to its own XDG_DATA_HOME temp dir. |
| C6 | constraint | respected | static_check | Detailed views still expose temporal_health, worker diagnostics, session debt, snapshot health, plugin runtime, project metadata, external state hygiene. |
| C7 | constraint | respected | static_check | adv_run_test still validates taskId, runs exec with timeout/maxBuffer, classifies failures, and shapes output. Shell compatibility tests cover semantics. |
| C8 | constraint | respected | static_check | All tests run via `pnpm test` from plugin/; Vitest-compatible imports; benchmark uses Node/Bun compatible APIs only. |
| DONT1 | avoidance | respected | review | Validation untouched; diagnostics moved between views with explicit audit; no fabricated fields added. |
| DONT2 | avoidance | respected | review | ChangeSummaryMemo remains advisory; authoritative paths used for terminal/safety-critical callers. |
| DONT3 | avoidance | respected | review | Summary plan documents per-field audit; session-debt removed from summary based on user-validated value; OpenCode debt retained only in hygiene. |
| DONT4 | avoidance | respected | review | CI relies on structural tests (provider non-invocation, no-unneeded hydration, slim formatted sections); manual benchmark provides wall-clock evidence. |
| DONT5 | avoidance | respected | review | Only files in scope (status/test/change/metrics/visibility/store/specs) modified plus benchmark/docs additions; no unrelated WIP cleanup. |
| DONT6 | avoidance | respected | review | adv_run_test still uses child_process.exec with original options; compatibility matrix tests cover preserved semantics. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1fd639e966dd | AC3 | AC3 | C6, DONT3, DONT5 |  |
| tk-9afd36b14b54 | AC1, AC2, AC3, C5, C6 | AC1, AC2, AC3, AC11 | C3, C4, C5, C6, DONT1, DONT3, DONT5 |  |
| tk-8651126b0d37 | AC8 | AC8, AC11 | C4, C5, C8, DONT1, DONT4 |  |
| tk-2126e275c4d4 | AC6, AC8 | AC6, AC7, AC8, AC11 | C3, C7, C8, DONT1, DONT2, DONT6 |  |
| tk-c0b608fbf656 | AC5 | AC5, AC7, AC11 | C1, C3, C4, DONT1, DONT2 |  |
| tk-54da4cc71d89 | AC4, AC5, AC7 | AC4, AC5, AC7, AC11 | C1, C3, C4, C5, DONT1, DONT2 |  |
| tk-5e1bc4360a0d | AC9, AC10 | AC9, AC10, AC11 | C1, C5, C8, DONT4 |  |
| tk-18909a73a58f | AC1, AC5, AC6, AC8, AC9 | AC10, AC11 | C1, C2, C3, C4, C7, C8, DONT1, DONT2, DONT6 |  |
| tk-656c112adf34 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
