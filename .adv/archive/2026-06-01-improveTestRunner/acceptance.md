# Acceptance

Reviewed at: 2026-06-01T21:45:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_run_test` returns explicit result state: executed command, `passed`, deterministic `classification`, duration, and output byte counts. | pass | src/tools/test.test.ts typed result contract tests pass; bin/oc-test full passed. |
| AC2 | acceptance_criterion | Existing shell compatibility remains covered by tests: metacharacters, pipelines, redirects, stdout/stderr capture, timeout/kill behavior, output-limit behavior, and non-zero exit reporting. | pass | src/tools/test.test.ts shell compatibility tests pass; bin/oc-test full passed. |
| AC3 | acceptance_criterion | Speed evidence covers both hot-loop latency for small/targeted runs and noisy-suite stability without buffer-driven evidence loss. | pass | Benchmark: hot true p50 wall 2.3ms/duration 2.2ms; noisy stdout p50 wall 21.8ms/duration 21.4ms, outputTruncated true, maxBufferExceeded false. |
| AC4 | acceptance_criterion | Schema, specs, docs, tests, and agent instructions describe one public `adv_run_test` contract. | pass | src/tools/test-contract-assets.test.ts passed; Prettier check for spec/docs/tool surfaces passed. |
| AC5 | acceptance_criterion | TDD phase drift is resolved by design: either typed phase semantics are restored or stale phase references are removed by explicit spec/docs cleanup. | pass | src/tools/test.test.ts phase schema test and docs asset test passed. |
| AC6 | acceptance_criterion | Hybrid ownership is enforced: ADV may advise about repo-local test workflow/throttle routing, but must not silently rewrite user commands. | pass | src/tools/test.test.ts advisory/no-rewrite tests passed; bin/oc-test wrapper verified. |
| AC7 | acceptance_criterion | Sub-agent verification can consume structured `adv_run_test` evidence without relying solely on free-text command/exit-code scraping. | pass | src/tools/subagent-report.test.ts structured adv_run_test evidence tests passed. |
| AC8 | acceptance_criterion | Vitest/pnpm structured evidence works when available; generic shell fallback remains mandatory. | pass | src/tools/subagent-report.test.ts and src/tools/test.test.ts passed. |
| AC9 | acceptance_criterion | `advance-meta` substep telemetry remains intact for `targetRouting`, `taskLookup`, `commandExecution`, and `outputShaping`. | pass | src/tools/test.test.ts telemetry phase tests passed. |
| AC10 | acceptance_criterion | Raw command output is not written to system logs by default. | pass | adv-reviewer verdict READY; code review found no raw output system logging path. |
| C1 | constraint | `adv_run_test` must execute every supplied command fresh; no caching, skipping, or fabricated evidence. | respected | src/tools/test.test.ts fresh-subprocess test passed. |
| C2 | constraint | Shell-command semantics must be preserved unless design explicitly proves and approves a compatibility change. | respected | Shell compatibility tests passed. |
| C3 | constraint | Backward-compatible response fields such as `exitCode`, `output`, `timedOut`, and `maxBufferExceeded` must remain available unless design identifies a safe migration path. | respected | src/tools/test.test.ts legacy field assertions passed. |
| C4 | constraint | Correctness must be structural: typed schemas, deterministic classification, parser tests, and compatibility tests over heuristic-only inference. | respected | Zod schemas, deterministic classifyRun, parser tests, and asset tests added. |
| C5 | constraint | Speed claims must be backed by measured evidence, not assumed from implementation changes. | respected | Benchmark sample recorded hot/noisy timings and full/smoke tests passed. |
| C6 | constraint | Repo-local workflow/throttle policy must remain repo-owned; ADV may surface advice but must not silently rewrite commands. | respected | No-rewrite advisory tests passed; bin/oc-test is repo-local wrapper. |
| C7 | constraint | Privacy boundary: raw command output and possible secrets must not be written to system logs by default. | respected | adv-reviewer READY; no raw-output system logging introduced. |
| DONT1 | avoidance | Do not replace ADV’s task completion/checkpoint verification model. | respected | Task completion/checkpoint flow unchanged; all tasks completed via adv_task_checkpoint. |
| DONT2 | avoidance | Do not create separate same-scope test tasks as a replacement for inline TDD evidence. | respected | Existing 5-task plan preserved; no same-scope test task added. |
| DONT3 | avoidance | Do not turn `adv_run_test` into a broad QA platform or browser/UI verification suite. | respected | adv_run_test remains shell runner with typed evidence; no browser/UI QA platform added. |
| DONT4 | avoidance | Do not silently mutate user-provided commands to use wrappers/profiles. | respected | src/tools/test.test.ts proves command unchanged when advisory emitted. |
| DONT5 | avoidance | Do not make Vitest-specific parsing mandatory for arbitrary shell commands. | respected | Generic shell typed evidence implemented; Vitest parsing not mandatory. |
| DONT6 | avoidance | Do not add durable per-task evidence storage unless design proves returned evidence plus task completion summaries are insufficient. | respected | No durable per-task evidence ledger added. |
| OOS1 | out_of_scope | Repo-wide test architecture refactors unrelated to `adv_run_test` speed or consistency. | not_applicable | No unrelated repo-wide test architecture refactor performed. |
| OOS2 | out_of_scope | Unrelated ADV tool refactors beyond direct integration points needed for `adv_run_test` contract consistency. | not_applicable | Changes limited to adv_run_test, evidence consumer, specs/docs/tests, wrapper, and verification fixes. |
| OOS3 | out_of_scope | Persistent raw-output logging to system logs. | not_applicable | No persistent raw-output logging added. |
| OOS4 | out_of_scope | Cross-repo changes; current scope is the `advance` repo only. | not_applicable | All changes are within current advance repo worktree. |

