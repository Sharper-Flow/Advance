# Agreement

## Objectives

1. Make warm default ADV tools faster, prioritizing repeated `adv_status`, `adv_change_list`, common phase-start reads, and frequent `adv_run_test` loops.
2. Make `adv_status view:"summary"` genuinely lazy and slim: detailed-only providers must not run unless a detailed view requests them.
3. Audit the current summary formatted sections and session-debt diagnostic; remove session-debt entirely if it does not provide clear operator value, otherwise confine it to detailed diagnostics.
4. Add a correctness-safe summary read model for default list/status paths where the response contract can be satisfied without per-change full hydration.
5. Improve `adv_run_test` hot-path latency/diagnosability where safe, without weakening task validation, command execution, timeout/max-buffer classification, output shaping, or TDD evidence correctness.
6. Add production-visible latency telemetry for ADV tools, named `adv_status` phases, and `adv_run_test` overhead/substeps.
7. Repair and document the latency benchmark harness under the Temporal-only store contract.
8. Preserve ADV correctness: specs, Temporal signal/query state, cache-refresh discipline, gates, archive safety, worktree safety, task evidence, and schema validation remain authoritative.

## Acceptance Criteria

1. `adv_status view:"summary"` does not invoke detailed-only health, hygiene, session-debt, snapshot-health, plugin-runtime, project-metadata, or worktree-cleanup providers.
2. Summary formatted output is slim; health/worktree/session-debt details appear only in detailed views unless audit proves a summary-critical need.
3. Session-debt diagnostic is audited; remove it if low-value, or confine it to detailed diagnostics.
4. Warm default reads are optimized first: `adv_status`, `adv_change_list`, and common phase-start reads.
5. Default list/status paths avoid per-change full hydration when summary data satisfies response contract.
6. `adv_run_test` hot path is profiled and improved where safe; tests prove task validation, timeout/max-buffer classification, output shaping, and exit-code semantics remain intact.
7. Summary/cache/test-tool optimizations never authorize gates, archive, worker-lock recovery, claims, task completion, or fabricated test evidence.
8. Telemetry exposes per-tool `duration_ms`, named `adv_status` phase durations, and enough `adv_run_test` timing/substep attribution to diagnose overhead around command execution.
9. Benchmark harness works under current Temporal-only store contract and documents command, fixture, output.
10. CI uses structural regression tests for lazy/provider non-invocation and no-unneeded hydration; manual Temporal benchmark supplies real latency evidence.
11. Existing spec-law, Temporal cache-refresh, worktree safety, TDD evidence, and gate-completion tests do not regress.

## Constraints

1. Do not replace Temporal as durable execution/state backend.
2. Do not remove or weaken Zod validation or schema/boundary correctness for speed.
3. Do not change gate semantics, approval rules, archive rules, task completion rules, or TDD evidence semantics except documented read/test-tool performance internals that preserve behavior.
4. Do not let stale cached diagnostics authorize safety-critical mutations or decisions.
5. Do not create hidden background mutations from read-only tools.
6. Detailed views/includes must remain able to surface diagnostic data that still has value.
7. `adv_run_test` must not skip task validation, command execution, timeout enforcement, max-buffer enforcement, or output/error classification.
8. Tests must respect repo conventions: commands from `plugin/`, Node/Vitest tests, Bun runtime gotchas.

## Avoidances

1. Do not optimize by skipping validation, hiding diagnostics, or fabricating summary/test evidence fields.
2. Do not make `ChangeSummaryMemo` or any cache a gate/archive/claim/task-evidence authority.
3. Do not keep expensive summary work only because it is currently present in `formatted`; audit and justify each summary field.
4. Do not add flaky wall-clock CI budgets as the primary regression guard.
5. Do not perform broad unrelated status/WIP cleanup beyond latency-driven read/test-path changes.
6. Do not change exact shell-command semantics for `adv_run_test` unless design evidence proves the replacement preserves compatibility.

## Preview Applicability

visual_surface: false

Rationale: this change affects CLI/MCP tool response shape, diagnostics, and test execution tooling, not front-end/browser-visible UI. Chat/formatted text changes are non-visual operational output and should be verified through tool-output tests, not browser preview.

## Decisions

### User Decisions

- Summary shape: slim summary preferred, but audit whether detailed sections are needed. User specifically questioned session-debt value and is open to removing it entirely if it is not useful.
- Latency target: warm default reads first.
- Performance evidence: CI structural non-invocation/no-hydration tests plus manual Temporal benchmark.
- Scope expansion: include `adv_run_test`, because user identified it as a constantly used hot path with high payoff.

### Agent Decisions (LBP)

- Keep Temporal. Context7 `/temporalio/sdk-typescript` supports Visibility query/list and signal/query correctness; replacement is out of scope and not justified by latency evidence.
- Keep Zod validation. Context7 `/colinhacks/zod` confirms structural parsing/validation; validation is not evidenced as bottleneck.
- Use existing `lru-cache`/probe-cache pattern for bounded optional probes where needed. Context7 `/isaacs/node-lru-cache` supports coalesced `cache.fetch()` and stale-on-abort/rejection patterns.
- Treat summary projection as advisory/read-only; authoritative workflow state remains required for gates, archive, claims, recovery, task completion, and test evidence.
- Treat `adv_run_test` optimization as measurement-first: preserve command semantics, evidence semantics, and bounded execution before considering subprocess implementation changes.
- Sequence design so lazy status + telemetry/bench repair + `adv_run_test` profiling can land before or alongside summary-index work; Visibility attribute alignment must be resolved before relying on Visibility-backed summary fast paths.

## Deferred Questions

None. Latency budget numbers may be set during design as proposed targets, but acceptance requires structural evidence plus manual benchmark output rather than a user-approved numeric SLA.

## Sign-Off

Acceptance criteria approved by user replies: initial `approve`, then scope-expansion `approve` for `adv_run_test`.
