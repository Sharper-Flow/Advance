# Executive Summary — improveAdvLatency

## Outcome
ADV warm-default read tools are measurably faster. `adv_status view:"summary"` runs ~2.7× faster than health view (p50 ≈42ms vs ≈115ms) by skipping detailed providers that summary doesn't need. `adv_change_list` now has an optional summary-read path that avoids per-change full hydration when memo/cache data satisfies the response contract. `adv_run_test` has always-on substep telemetry for diagnosing overhead. All changes preserve gate safety, TDD evidence, and shell-command semantics.

## What Changed
- **Lazy status views**: `buildStatusViewPlan(view)` gates which providers execute. Summary skips 9 detailed providers (queue serviceability, search attributes, worktree cleanup/census, session debt, health snapshot, external hygiene, snapshot health, peer sessions, plugin runtime, project metadata). Health retains most diagnostics except session-debt. Hygiene retains everything including session-debt.
- **Session-debt confinement**: `scanOpenCodeSessionDebt` removed from summary and health hot paths; retained only in hygiene view.
- **Summary read model**: Optional `Store.changes.listSummary` surface with Temporal implementation that serves memo/cache hits without per-change hydration; authoritative fallback for archived/closed/content-filter callers.
- **Always-on telemetry**: `recordToolDuration` wired into `safeExecute`/`safeExecuteSimple` for all tools. Named phase durations for `adv_status` (9 phases) and `adv_run_test` (4 substeps). In-memory `adv_tool_durations` map + bounded `recent_phase_durations` ring.
- **Visibility query alignment**: `list-change-workflows.buildVisibilityQuery` converged on registered `AdvAffectedProjects` KeywordList.
- **Benchmark harness**: Rewritten with disk-store substitute, documented in `docs/bench-adv-latency.md`. Opt-in `--mode temporal` path.
- **Spec deltas**: 6 new requirements (v1.12.0) in advance-meta: rq-advStatusLazyView01, rq-changeSummaryReadModel01, rq-advLatencyTelemetry01, rq-advLatencyBench01, rq-visibilityProjectScope01, rq-advRunTestLatency01.

## Verification
- `pnpm run check` (typecheck + lint + format): pass
- `pnpm test` full suite: pass
- Contract review matrix: 25/25 (AC1-AC11 pass, C1-C8 respected, DONT1-DONT6 respected)
- `adv_change_validate strict`: pass (only expected NO_DELTAS warning)
- Manual benchmark: summary p50 ≈41.7ms vs health p50 ≈114.6ms
- TDD: RED→GREEN cycles verified for lazy status, telemetry, and summary-read tasks

## Safety
- Summary/cache data never authorizes gates, archive, worker-lock recovery, claims, task completion, or test evidence
- `adv_run_test` subprocess implementation unchanged (child_process.exec retained per KD-8); shell semantics, timeout, maxBuffer, exit-code classification all preserved
- Detailed views still surface all diagnostics that have value
