# Design

## Architecture Overview

Use a three-plane latency architecture.

1. **Planned status execution** in `plugin/src/tools/status.ts`.
   - Replace post-hoc `applyStatusView(fullOutput, view)` as the primary control point with `buildStatusViewPlan(view)`.
   - The plan decides which provider groups run: base status, minimal Temporal-ok, queue health, search attributes, config, recent enrichment, worktree cleanup, worktree census, session debt, health snapshot, snapshot health, spec recount, peer sessions, plugin runtime, project metadata, external-state hygiene, metrics.
   - Each view builds its own formatted output. Summary does not build a full health/worktree/session-debt formatted block and then hide raw fields.
   - Preserve `adv_status` context snapshot emission per `chat-output-display` (`rq-ctxsnap2`, `rq-ctxticker2.5`): primary active/draft/pending change keeps full-box `_contextSnapshot`; non-primary changes keep ticker snapshots. Slim summary formatting must not remove required context snapshots.

2. **Summary read model** in Temporal store.
   - Add a summary-oriented listing surface, e.g. `changes.listSummary(filter)` and/or `statusSummary()`.
   - Default warm paths use `ChangeSummaryMemo`/overlay summaries when complete for the requested ID set and hydrate only missing summaries.
   - Full `changes.list`, `changes.get`, gates, archive, recovery, claims, task completion, and safety-critical flows remain authoritative full-state paths.
   - Cold-start and terminal/detailed paths keep fallback to Visibility + disk/archive + full hydration until summary proof exists.

3. **Test-tool hot path** in `plugin/src/tools/test.ts`.
   - Optimize `adv_run_test` through measurement-first changes: record task lookup, subprocess runtime, output shaping, and target-project routing overhead.
   - Preserve exact command semantics by default. Node.js docs state `child_process.exec()` spawns a shell, executes the command in that shell, buffers output, supports `timeout`, `maxBuffer`, `killSignal`, and reports exit code/signal through the error object. The current tool contract accepts an exact shell command, so replacing `exec` with `spawn` is not a default design step unless shell semantics are preserved explicitly.
   - Keep task validation before execution and keep timeout/max-buffer/output-shaping classifications intact.

4. **Telemetry as first-class diagnostics**.
   - Reuse `safeExecute` timing. It already computes `duration_ms` for `ADV_PROFILE`; make in-memory metrics always record duration while keeping profile-log writes gated.
   - Extend metrics with per-tool duration stats and recent phase/substep timings for `adv_status` and `adv_run_test`.
   - Surface telemetry in `adv_status view:"health"`; summary remains slim.

5. **Benchmark and regression evidence**.
   - Repair `plugin/scripts/bench-adv-latency.ts` for the current Temporal-only store contract or provide a documented isolated benchmark substitute.
   - CI protects structure: provider non-invocation, slim formatted summary, no unneeded hydration, test-tool semantics, summary fallback safety.
   - Manual Temporal benchmark provides real latency evidence.

## Key Decisions

### KD-1: Status view planning before provider execution

`adv_status` currently computes full output before projection. The durable design is a `StatusViewPlan` that executes only view-required provider groups.

- Summary: base status summary, concise recommendations, required context snapshots, minimal Temporal-ok if cheap/cached, no detailed archaeology.
- Health: Temporal/STSL/search-attribute/session/snapshot/plugin runtime diagnostics and metrics.
- Changes: full recent-change detail.
- Hygiene: leak/session/snapshot/project-metadata archaeology and cleanup advisories.

### KD-2: Slim summary formatted output while preserving required context snapshots

Summary raw output and `formatted` must align. Health/worktree/session-debt/peer sections move out of summary formatted output unless an audited field is proven summary-critical and cheap. Required `_contextSnapshot` emission remains unchanged.

### KD-3: Session-debt audit has a planning-time binary decision

`scanOpenCodeSessionDebt()` is removed from summary. Planning must include a dedicated task that decides before Phase A code lands:

- **Remove** status integration if it is low-value or superseded by other doctor tooling.
- **Confine** it to health/hygiene if it has clear operator value, with explicit freshness/degraded metadata.

No implementation task may leave session-debt ambiguous in summary.

### KD-4: Summary listing surface instead of weakening full list

Do not silently change `changes.list()` semantics for all callers. Add a summary-specific store method for default tool paths. Full list stays available for compatibility, terminal statuses, archive/closed queries, and filters whose correctness requires full state.

### KD-5: Summary projection is advisory only

Summary/cache data may guide display and default navigation. It must never authorize gates, archive, worker-lock recovery, claims, task completion, or contract/test evidence. Those paths continue to load authoritative workflow state.

### KD-6: Visibility direction — dual-read transition, then converge on `AdvAffectedProjects`

The implementation direction is explicit:

1. Short term: list queries support both `AdvAffectedProjects` and legacy `AdvProjectId` where available, with disk/full hydration fallback for missing proof.
2. Long term: converge project-scoped Visibility filtering on registered `AdvAffectedProjects`, matching backlog-claim queries.
3. If `AdvProjectId` is kept for compatibility, register it explicitly and document it; otherwise remove reliance after transition.

Until transition tests prove completeness, summary listing must not rely on Visibility-only ID completeness.

### KD-7: Structural CI, manual wall-clock benchmark

CI wall-clock budgets are not the primary guard. CI proves lazy execution and no unnecessary hydration structurally. Manual Temporal benchmark captures actual latency before acceptance.

### KD-8: `adv_run_test` uses compatibility-preserving optimization first

`adv_run_test` remains exact-command and shell-compatible by default. First implementation pass adds telemetry and removes/avoids proven overhead. Subprocess strategy changes are allowed only when tests prove preserved behavior for:

- shell metacharacters/pipelines/redirects,
- timeout and kill classification,
- max-buffer classification,
- stdout/stderr capture,
- non-zero exit code reporting,
- output shaping.

### KD-9: No ADR required

The decisions are important but not hard-to-reverse enough to require a repo ADR. They are captured in `design.md`, specs, and tasks.

## Implementation Strategy

### Phase A — status lazy plan + slim summary

1. Add RED tests in `plugin/src/tools/status.test.ts`:
   - summary view does not call detailed providers (`scanOpenCodeSessionDebt`, `scanSnapshotHealth`, `getPluginRuntimeInfo`, `readProjectMetadata`, `advWorktreeCleanup`, detailed queue/search/session probes where not summary-required).
   - summary formatted output omits health/worktree/session-debt/peer sections.
   - summary still emits required `_contextSnapshot` per `chat-output-display`.
   - health/hygiene still expose detailed diagnostics.
2. Extract status provider functions and `buildStatusViewPlan(view)`.
3. Split formatter input by view so summary formatting cannot pull detailed-only data.
4. Remove `advWorktreeCleanup("status")` from summary; keep cleanup in explicit `adv_worktree_cleanup` and/or hygiene if retained.
5. Execute KD-3 binary decision: remove session-debt status integration or confine it to health/hygiene.

### Phase B — telemetry

1. Extend `AdvMetricsCounters` with per-tool duration stats, e.g. `{ count, total_ms, last_ms, max_ms }` by tool.
2. Record duration inside `safeExecute` on success and error. Keep `ADV_PROFILE=1` file logging as optional extra.
3. Add status phase timer helper around named phases: status load, recent-change enrichment, worktree/probe diagnostics, snapshot/session diagnostics, formatting/projection.
4. Add `adv_run_test` substep timing around target routing, task lookup, command execution, output shaping, and response formatting.
5. Surface metrics in health view only.
6. Tests cover success + error duration recording, status phase names, and `adv_run_test` substep names.

### Phase C — `adv_run_test` hot-path improvement

1. Add tests in `plugin/src/tools/test.test.ts` for preserved semantics:
   - task not found still returns no execution.
   - shell command features still work (`&&`, redirects/pipes where supported by test environment).
   - timeout/max-buffer classifications remain stable.
   - output shaping still keeps high-signal lines and diagnostic prefixes.
   - elapsed/substep telemetry is present in success and failure outputs or health metrics.
2. Profile current overhead on representative commands:
   - no-op/fast command to measure wrapper overhead,
   - typical targeted test command,
   - failing command with noisy output,
   - timeout/max-buffer synthetic cases.
3. Keep `exec` for exact shell-command compatibility unless profiling proves child-process buffering is the bottleneck and a `spawn({ shell: true })` implementation preserves all semantics.
4. If changing subprocess implementation, introduce a small internal runner abstraction so tests cover both classification and output capture structurally.
5. Do not cache or skip test command execution. Every `adv_run_test` call must run the supplied command and report fresh evidence.

### Phase D — benchmark repair

1. Fix `bench-adv-latency.ts` so it initializes under Temporal-only store contract or documents/runs a valid isolated substitute.
2. Include benchmark metadata: repo root, change count/fixture shape, iterations, warmup, Temporal mode, output path.
3. Include `adv_run_test` benchmark samples for fast command overhead and representative test command overhead.
4. Document exact command and output location.

### Phase E — summary read model

1. Add store type for `changes.listSummary(filter)` and/or `statusSummary()` returning summary response shapes.
2. Implement Temporal-store summary resolver:
   - collect candidate IDs from memo, dual-read Visibility, and disk; terminal/archive IDs only when requested.
   - use `ChangeSummaryMemo`/overlay for cached summaries.
   - hydrate only IDs missing summary proof.
   - update memo/overlay from hydrated authoritative state through existing invalidation/update paths.
   - fall back to full list when filters or terminal cases exceed summary proof.
3. Update default `adv_change_list` and status warm paths to use summary method where response contract is satisfied.
4. Keep full paths for `includeArchived`, closed/archive, complex filters until parity tests prove summary correctness.
5. Add tests showing second warm read avoids N per-change hydration and safety-critical tools still call full state.

### Phase F — Visibility alignment and specs

1. Implement KD-6 dual-read transition and convergence on `AdvAffectedProjects`, or explicitly register/document `AdvProjectId` if compatibility requires keeping it.
2. Add spec deltas:
   - `rq-advStatusLazyView01`
   - `rq-changeSummaryReadModel01`
   - `rq-advLatencyTelemetry01`
   - `rq-advLatencyBench01`
   - `rq-visibilityProjectScope01`
   - `rq-advRunTestLatency01`
3. Add citations near implementation and tests for new requirement IDs.

## Affected Components

- `plugin/src/tools/status.ts` — view planning, providers, formatting, phase timings.
- `plugin/src/utils/tool-formatters.ts` — view-specific status formatting if needed.
- `plugin/src/storage/store-types.ts` — summary method type.
- `plugin/src/storage/store-temporal/index.ts` — summary resolver and status summary construction.
- `plugin/src/storage/store-temporal/changes.ts` — `changes.listSummary` implementation and list routing.
- `plugin/src/storage/store-temporal-memo.ts` — summary model additions if fields/proof metadata are needed.
- `plugin/src/temporal/list-change-workflows.ts` and search-attribute registration path — project-scope Visibility alignment.
- `plugin/src/tools/test.ts` — `adv_run_test` substep telemetry and safe hot-path optimizations.
- `plugin/src/tools/test.test.ts` — preserved semantics and telemetry tests.
- `plugin/src/utils/metrics.ts` and `plugin/src/utils/safe-execute.ts` — duration stats.
- `plugin/src/index.ts` — remove duplicate/obsolete metric responsibility if timing moves into `safeExecute`.
- `plugin/scripts/bench-adv-latency.ts`, `plugin/src/perf/latency.ts` — benchmark repair/report.
- Tests around status, store-temporal summary reads, metrics, benchmark, `adv_run_test`, spec citation invariants.

## LBP Analysis

- Temporal remains the durable backend. Context7 `/temporalio/sdk-typescript` confirms Visibility query/list support and signal/query semantics. The design uses Visibility and workflow queries without replacing the runtime.
- `lru-cache`/probe-cache remains appropriate for optional bounded probes. It coalesces concurrent fetches and supports stale-on-abort/rejection; stale values remain diagnostic-only.
- Zod stays at boundaries. No evidence shows validation is the latency bottleneck, and structural validation protects correctness.
- Node.js `child_process.exec()` is compatible with the current `adv_run_test` contract because it executes a command string in a shell and buffers stdout/stderr with timeout/maxBuffer controls. `spawn` defaults to no shell, so it is not a drop-in replacement for exact shell command strings unless used with `shell: true` and covered by compatibility tests.
- Deterministic view planning and substep telemetry match current agent-orchestration best practice: avoid hidden work, make phases explicit, and measure substeps.

## Design Leverage Scout

- Candidates considered: 5.
- Auto-adopted:
  - Reuse `safeExecute` profiling/timing path for telemetry.
  - Use memo-served warm `changes.listSummary` fast path with fallback for misses.
  - Remove worktree cleanup and session-debt from summary plan.
- Integrated technical refinements:
  - Removed dead `emitChangeSummarySignal` as a design dependency; projectWorkflow summary signal is retired/no-op.
  - Sequenced Visibility attribute alignment before any Visibility-only completeness reliance.
  - Added `adv_run_test` measurement-first design after user scope expansion.
- Surfaced to user: none; refinements are technical and preserve approved agreement.

## Validator Caution Handling

Prior validator cautions resolved in this revision:

1. `_contextSnapshot` preservation explicitly added for summary status.
2. Session-debt audit is a planning-time binary decision before Phase A code lands.
3. Visibility direction is explicit: dual-read transition, then converge on registered `AdvAffectedProjects` unless `AdvProjectId` is explicitly registered/documented.

## Risks / Mitigations

| Risk | Mitigation |
| --- | --- |
| Summary model hides changes | Union memo/dual-Visibility/disk IDs, hydrate missing summaries, full fallback when proof missing. |
| Cache used as authority | Contract refs and tests require gates/archive/claims/recovery/task completion to use full workflow state. |
| Summary formatting compatibility break | Agreement explicitly chose slim summary after audit; detailed views keep diagnostics. |
| Session-debt removal loses useful doctor signal | Audit first; keep in health/hygiene if value is clear. |
| Visibility attribute drift causes missing/slow results | Dual-read transition; converge on registered `AdvAffectedProjects`; fallback until completeness proof. |
| Wall-clock tests flake | Use structural CI tests; manual benchmark for real latency. |
| Telemetry overhead | In-memory aggregate/ring only; no per-call disk write unless `ADV_PROFILE=1`. |
| `adv_run_test` semantics regress | Preserve `exec` by default; if runner changes, require shell-compatibility, timeout/maxBuffer, exit-code, and output-shaping tests. |
| `adv_run_test` optimization fabricates evidence | Never cache/skip command execution; every call runs supplied command and records fresh result. |

## Validation Status

Validator: `VALIDATED`.

Independent validator found no conflicts and no cautions. Required planning follow-ups:

1. Include session-debt remove/confine binary decision before Phase A implementation.
2. Include RED tests for provider non-invocation and `_contextSnapshot` preservation.
3. Implement telemetry before `adv_run_test` subprocess profiling so baseline substep numbers exist.
4. Include `adv_run_test` compatibility matrix before any `exec` to `spawn` change.
5. Include tests proving gates/archive/recovery/claims/task completion still use full state.
6. Include Visibility convergence tests proving `AdvAffectedProjects` coverage before removing `AdvProjectId` reliance.
