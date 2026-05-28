# Improve ADV latency

## Problem

ADV hot tools pay unnecessary latency because default status/list/show/test paths eagerly do work that is not always required. Read paths compute diagnostic/artifact/workflow state for lightweight orientation, and `adv_run_test` adds overhead around very frequent TDD/test loops. Operators also lack first-class latency telemetry to identify slow tools and substeps.

## Scope

### In Scope

- `adv_status` lazy execution by `view`, especially `view:"summary"` avoiding health/hygiene/session/worktree-cleanup/plugin-runtime/project-metadata work.
- Slim summary formatted output: detailed health/worktree/session-debt sections move to detailed views unless audited as summary-critical.
- `adv_change_list` and status default paths served from summary data where correctness allows.
- `adv_change_show` lightweight/read-shape improvements for common phase-start reads.
- `adv_run_test` latency/throughput improvements for frequent TDD/test loops, without weakening command execution, timeout, output shaping, or evidence correctness.
- Production-visible latency telemetry: per-tool durations plus named phase durations for `adv_status` and `adv_run_test` where useful.
- Benchmark harness repair/documentation under Temporal-only store contract.
- Spec deltas and tests protecting the optimized behavior.

### Out of Scope

- Replacing Temporal.
- Weakening Zod/schema validation.
- Changing gate, approval, archive, task completion, or TDD evidence semantics except read/test-tool performance internals that preserve behavior.
- Broad unrelated WIP/status cleanup.

### Must Not

- Must not use stale cached diagnostics/summaries to authorize gates, archive, worker-lock recovery, claims, task completion, or test evidence.
- Must not hide useful diagnostics from detailed views.
- Must not create hidden background mutations from read-only tools.
- Must not make `adv_run_test` skip task validation, command execution, timeout enforcement, max-buffer enforcement, or output/error classification.

## Success Criteria

1. Automated tests prove `adv_status view:"summary"` does not invoke detailed-only providers.
2. Summary formatted output is slim; detailed sections appear only in detailed views unless audited as summary-critical.
3. Session-debt diagnostic is audited; remove it if low-value, or confine it to detailed diagnostics.
4. Warm default reads are optimized first: `adv_status`, `adv_change_list`, common phase-start reads.
5. Default list/status paths avoid per-change full hydration when summary data satisfies response contract.
6. `adv_run_test` hot path is profiled and improved where safe; tests prove task validation, timeout/max-buffer classification, output shaping, and exit-code semantics remain intact.
7. Summary/cache/test-tool optimizations never authorize safety-critical actions or fabricate evidence.
8. Telemetry exposes per-tool `duration_ms`, named `adv_status` phase durations, and enough `adv_run_test` timing/substep attribution to diagnose overhead around command execution.
9. Benchmark harness works under current Temporal-only store contract and documents command, fixture, output.
10. CI uses structural regression tests; manual Temporal benchmark supplies real latency evidence.
11. Existing spec-law, Temporal cache-refresh, worktree safety, TDD evidence, and gate-completion tests do not regress.

## Discovery Addendum — adv_run_test

User added `adv_run_test` as a hot-path target during design: "another one that we are constantly running is the adv_run_test tool, if we can improve that... that would be huge".

Current-state evidence:

- `plugin/src/tools/test.ts` uses `child_process.exec` via `promisify(exec)` for each command, validates `taskId` through `store.tasks.get`, then executes with timeout/maxBuffer bounds and shapes output.
- `plugin/src/tool-registry.ts` wraps `adv_run_test` in `safeExecute` with a 305s outer timeout because inner `timeoutMs` can reach 300s.
- `plugin/src/tools/test.ts` already protects timeout and max-buffer cases, but it does not expose elapsed duration or substep timings.
- `plugin/src/tools/test.test.ts` covers command success/failure, missing task, output truncation, high-signal failure/summary line shaping, and diagnostic-prefix preservation.

Likely improvement areas for design:

- Add elapsed time and substep telemetry: task lookup, subprocess runtime, output shaping, target-project routing overhead.
- Avoid unnecessary overhead around the command path while preserving task validation and evidence semantics.
- Consider switching from `exec` to `spawn`/streaming only if evidence shows output buffering or shell startup behavior is a bottleneck; preserve exact shell command semantics unless explicitly redesigned.
- Ensure host-level `bin/oc-test` policy remains honored by agents; `adv_run_test` should not bypass user-provided commands.

## Draft Spec Deltas

- `rq-advStatusLazyView01` — status view planning before detailed providers.
- `rq-changeSummaryReadModel01` — correctness-safe summary read model for default list/status.
- `rq-advLatencyTelemetry01` — per-tool and named phase duration telemetry.
- `rq-advLatencyBench01` — repaired/documented benchmark harness.
- `rq-visibilityProjectScope01` — consistent project-scope Visibility attributes.
- `rq-advRunTestLatency01` — `adv_run_test` hot-path latency improvements preserve task validation, command execution semantics, timeout/max-buffer classification, output shaping, and test evidence correctness.

## Constraints

- Specs are laws.
- ADV state access remains through ADV tools/store abstractions.
- Temporal signal/query correctness and cache-refresh discipline remain mandatory.
- Read-only tools remain read-only.
- Tests run under Node/Vitest while plugin runtime is Bun.
