# Contract Traceability

**Change ID:** improveTestRunner
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-01T21:45:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | src/tools/test.test.ts typed result contract tests pass; bin/oc-test full passed. |
| AC2 | acceptance_criterion | pass | test | src/tools/test.test.ts shell compatibility tests pass; bin/oc-test full passed. |
| AC3 | acceptance_criterion | pass | test | Benchmark: hot true p50 wall 2.3ms/duration 2.2ms; noisy stdout p50 wall 21.8ms/duration 21.4ms, outputTruncated true, maxBufferExceeded false. |
| AC4 | acceptance_criterion | pass | test | src/tools/test-contract-assets.test.ts passed; Prettier check for spec/docs/tool surfaces passed. |
| AC5 | acceptance_criterion | pass | test | src/tools/test.test.ts phase schema test and docs asset test passed. |
| AC6 | acceptance_criterion | pass | test | src/tools/test.test.ts advisory/no-rewrite tests passed; bin/oc-test wrapper verified. |
| AC7 | acceptance_criterion | pass | test | src/tools/subagent-report.test.ts structured adv_run_test evidence tests passed. |
| AC8 | acceptance_criterion | pass | test | src/tools/subagent-report.test.ts and src/tools/test.test.ts passed. |
| AC9 | acceptance_criterion | pass | test | src/tools/test.test.ts telemetry phase tests passed. |
| AC10 | acceptance_criterion | pass | test | adv-reviewer verdict READY; code review found no raw output system logging path. |
| C1 | constraint | respected | static_check | src/tools/test.test.ts fresh-subprocess test passed. |
| C2 | constraint | respected | static_check | Shell compatibility tests passed. |
| C3 | constraint | respected | static_check | src/tools/test.test.ts legacy field assertions passed. |
| C4 | constraint | respected | static_check | Zod schemas, deterministic classifyRun, parser tests, and asset tests added. |
| C5 | constraint | respected | static_check | Benchmark sample recorded hot/noisy timings and full/smoke tests passed. |
| C6 | constraint | respected | static_check | No-rewrite advisory tests passed; bin/oc-test is repo-local wrapper. |
| C7 | constraint | respected | static_check | adv-reviewer READY; no raw-output system logging introduced. |
| DONT1 | avoidance | respected | review | Task completion/checkpoint flow unchanged; all tasks completed via adv_task_checkpoint. |
| DONT2 | avoidance | respected | review | Existing 5-task plan preserved; no same-scope test task added. |
| DONT3 | avoidance | respected | review | adv_run_test remains shell runner with typed evidence; no browser/UI QA platform added. |
| DONT4 | avoidance | respected | review | src/tools/test.test.ts proves command unchanged when advisory emitted. |
| DONT5 | avoidance | respected | review | Generic shell typed evidence implemented; Vitest parsing not mandatory. |
| DONT6 | avoidance | respected | review | No durable per-task evidence ledger added. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No unrelated repo-wide test architecture refactor performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Changes limited to adv_run_test, evidence consumer, specs/docs/tests, wrapper, and verification fixes. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No persistent raw-output logging added. |
| OOS4 | out_of_scope | not_applicable | not_applicable | All changes are within current advance repo worktree. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9ff6dbd0ce85 | AC4, AC5, AC6, AC10 | AC4, AC5 | C1, C2, C3, C4, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4 |  |
| tk-c5e9276a91b7 | AC1, AC2, AC3, AC5, AC9 | AC1, AC2, AC3, AC5, AC9 | C1, C2, C3, C4, C5, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
| tk-b38ab6c31755 | AC1, AC7, AC8 | AC7, AC8 | C3, C4, C7, DONT1, DONT3, DONT5, DONT6 |  |
| tk-6e22872f00f0 | AC3, AC6, AC10 | AC6, AC10 | C1, C2, C4, C5, C6, C7, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
| tk-487c390605f1 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4 |  |
