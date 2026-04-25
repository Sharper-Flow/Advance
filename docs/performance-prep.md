# Research Pack: Performance Analysis

**Target:** performance
**Mode:** broad
**Created:** 2026-04-23
**Updated:** 2026-04-23

> **Historical note:** This research pack predates
> `completeTemporalOnlyMigration`. References to `bun:sqlite`,
> `better-sqlite3`, `store-legacy.ts`, or legacy fallback behavior describe the
> pre-migration snapshot. Current runtime storage is Temporal-only.

---

## Purpose & Scope

This pack covers a broad repo-wide performance analysis of the Advance (ADV) plugin. It examines the current state across six quality dimensions (security, reliability, testing, observability, DX, code quality), compares against long-term best practices (LBP), and surveys the external landscape for competitors and emerging patterns. This pack deliberately does NOT prescribe solutions — it documents findings with evidence so that `/adv-discover`, `/adv-proposal`, and subsequent research phases can cite it.

---

## Current State

### Security

1. **No findings.** Input validation is handled via Zod schemas in `src/types.ts`. No auth/authz, secrets, or injection vectors identified in this plugin's scope (it is a local-only development tool).

### Reliability

1. **Resolved by `runtimeResilienceHardening`: Temporal retry wrapper now uses bounded full-jitter backoff** (`src/temporal/retry-wrapper.ts:99-154`)
   - Previous fixed backoff sequence `[250, 1000, 2000]` was replaced with bounded exponential backoff plus full jitter via `computeDelay()`.
   - Current behavior still intentionally stops short of a shared circuit-breaker state machine; this remains a separate follow-up decision, not an open defect in current scope.
   - **Status:** FIXED

2. **Out-of-process worker restart budget is too low for production** (`src/temporal/out-of-process-worker.ts:38-39`)
   - Max 3 restarts with backoff `[1s, 3s, 10s]`. A flaky network or brief Temporal server restart can exhaust the budget permanently, leaving queues dead until manual intervention.
   - **Severity:** HIGH

3. **Resolved by `runtimeResilienceHardening`: `fs.ts` now uses bounded full-jitter lock backoff** (`src/utils/fs.ts:73-148`)
   - Fixed 50ms polling was replaced with bounded exponential backoff plus full jitter (`LOCK_INITIAL_WAIT_MS = 25`, `LOCK_COEFFICIENT = 2`, `LOCK_MAX_WAIT_MS = 500`).
   - Default lock timeout was also raised from 5s to 15s so contention prefers eventual success more often than immediate timeout.
   - **Status:** FIXED

4. **SQLite WAL checkpointing is passive** (`src/storage/health.ts:60-68`)
   - `checkpointWAL()` is called only during health checks / shutdown. No proactive checkpoint strategy means WAL files can grow unbounded during long-running sessions.
   - **Severity:** MEDIUM

5. **Temporal health probe opens a new connection per call** (`src/temporal/health-probe.ts:44-58`)
   - `getTemporalHealth()` creates a fresh `TemporalClientBundle` and immediately closes it. This is expensive for a health probe that may be called frequently.
   - **Severity:** MEDIUM

### Testing

1. **533 test files, no performance/benchmark tests** (`vitest.config.ts:8-13`, `package.json:30`)
   - 533 `.test.ts` / `.itest.ts` files. Coverage via `@vitest/coverage-v8` is configured but no benchmark suite exists.
   - No `bench` or `perf` tests found in the codebase.
   - **Severity:** MEDIUM

2. **Test suite runs on Node but production runs on Bun** (`vitest.config.ts:16-25`)
   - Tests mock `bun:sqlite` → `better-sqlite3` and `@opencode-ai/plugin` → mock. This is correct for unit tests but means Temporal worker behavior (which differs between Bun and Node) is not tested under the actual runtime.
   - **Severity:** MEDIUM

3. **Integration test for OOP worker is isolated and may be flaky** (`src/temporal/out-of-process-worker.itest.ts:79`)
   - Contains `await new Promise((resolve) => setTimeout(resolve, 500))` — fixed sleep instead of deterministic synchronization.
   - **Severity:** LOW

### Observability

1. **Profiling is opt-in via `ADV_PROFILE=1`** (`src/utils/debug-log.ts:36-38`)
   - Tool timing and startup phase instrumentation were recently added (see `reduceTemporalRoundTrip` change) but are gated behind an env var. Most users will never see performance data.
   - No structured metrics export (OpenTelemetry, Prometheus, etc.).
   - **Severity:** MEDIUM

2. **Debug logging is file-sink only, no structured aggregation** (`src/utils/debug-log.ts:57-69`)
   - `appendFileSync` to a single log file. No log rotation, no structured format (JSON Lines would be better), no sampling.
   - **Severity:** LOW

3. **No performance dashboards or SLOs defined**
   - No documented targets for p50/p99 latency of tool calls, startup time, or worker throughput.
   - **Severity:** LOW

### Developer Experience

1. **No `test:bench` or `test:perf` script** (`package.json:17-31`)
   - Scripts: `test`, `test:watch`, `test:coverage`. No benchmark or performance regression script.
   - **Severity:** MEDIUM

2. **Build produces two separate bundles** (`package.json:18-19`)
   - `tsup src/index.ts` + `tsup src/temporal/worker.ts src/temporal/workflows.ts`. Worker bundle is separate — correct for Temporal, but adds build complexity.
   - **Severity:** LOW

3. **Vitest config lacks performance-related settings**
   - No `testTimeout` override, no `pool` configuration for parallelization tuning, no `shard` support.
   - **Severity:** LOW

### Code Quality

1. **Temporal store adapter caches changes but not task queries** (`src/storage/store-temporal.ts:125-157`)
   - `changeCache` stores full change objects. `taskChangeIndex` is a reverse lookup. But `listResolvedChanges()` still issues a Temporal query per change (line 181-184: `Promise.all(changeIds.map(...getTemporalOrLegacyChange(...)))`).
   - N+1 query pattern: if there are 50 changes, 50 Temporal queries are fired in parallel. This is the root cause of the `reduceTemporalRoundTrip` change.
   - **Severity:** CRITICAL

2. **Legacy store loads JSON from disk on every read** (`src/storage/store-legacy.ts`)
   - JSON files are the source of truth; SQLite is a cache. `loadChange()` reads `change.json` from disk every time. No in-memory cache at the legacy layer.
   - **Severity:** HIGH

3. **Store-temporal falls back to legacy on every "not found"** (`src/storage/store-temporal.ts:62-70`)
   - `isExpectedFallbackError()` catches workflow-not-found and falls back to legacy. If Temporal is temporarily unavailable, EVERY call falls back to legacy, doubling I/O.
   - **Severity:** HIGH

4. **Multiple `Date.now()` calls for timing instead of `performance.now()`** (`src/utils/fs.ts:76`, `src/storage/store.test.ts:752`)
   - `Date.now()` has ~1ms resolution and is affected by system clock changes. `performance.now()` is monotonic and higher resolution.
   - **Severity:** LOW

5. **TTY cache uses `Date.now()` with 5-second TTL** (`src/events/terminal.ts:112-127`)
   - `TTY_CACHE_TTL_MS = 5000`. Fine for TTY detection, but `Date.now()` is not monotonic.
   - **Severity:** LOW

---

## LBP / Reference Comparison

### Deviation Table

| Practice                | Current State                                                       | LBP / Canonical                                                              | Deviation | Correction                                                                      |
| ----------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------- |
| Temporal worker backoff | Bounded exponential backoff with full jitter                        | Exponential backoff with jitter (Temporal docs recommend randomized backoff) | CORRECT   | Fixed by `runtimeResilienceHardening`                                           |
| Temporal health probe   | New connection per call                                             | Reuse connection or use lightweight gRPC health check                        | DRIFTED   | Cache connection in probe; use `connection.healthCheck()` if available          |
| SQLite PRAGMAs          | `initDatabase` sets cache_size, synchronous, etc.                   | PRAGMAs are per-connection; every new `Database()` must call init            | CORRECT   | Already handled in `health.ts:initDatabase()`                                   |
| SQLite WAL checkpoint   | Passive (on health check / shutdown)                                | Proactive checkpoint every N writes or time interval                         | DRIFTED   | Add periodic checkpoint in write-heavy paths or use `wal_autocheckpoint`        |
| File lock retry         | Bounded exponential backoff with full jitter and 15s default budget | Exponential backoff with cap (e.g., 50ms → 100ms → 200ms → 400ms → 800ms)    | CORRECT   | Fixed by `runtimeResilienceHardening`                                           |
| Test runtime            | Node with mocks                                                     | Production runs on Bun; tests should exercise actual runtime where possible  | DRIFTED   | Add Bun-native test runner or integration tests that run under Bun              |
| Performance timing      | `Date.now()`                                                        | `performance.now()` for high-resolution, monotonic timing                    | DRIFTED   | Replace `Date.now()` in timing contexts with `performance.now()`                |
| N+1 queries             | `listResolvedChanges()` queries Temporal per change                 | Batch query or cache                                                         | DRIFTED   | Implement batch query or persistent cache; see `reduceTemporalRoundTrip` change |
| Benchmarking            | None                                                                | Continuous benchmark suite (e.g., Vitest bench, benchmark.js)                | MISSING   | Add `test:bench` script with baseline comparisons                               |
| Metrics export          | File-sink debug logs                                                | Structured metrics (OpenTelemetry, Prometheus, or at least JSON Lines)       | MISSING   | Add JSON Lines structured log format or OTel integration                        |

### Greenfield Notes

If rebuilding today:

- **Backend:** Would still choose Temporal for durability, but would design the store adapter with batch queries and a persistent local cache from day one.
- **Runtime:** Would target Bun exclusively (no Node fallback) to simplify the worker model and remove the OOP worker complexity.
- **Observability:** Would integrate OpenTelemetry from the start instead of ad-hoc file-sink logging.
- **Testing:** Would run integration tests under the actual runtime (Bun) and use Vitest's built-in benchmark mode.

---

## Competitors & Alternatives

⚠ **External landscape analysis: Kagi not reachable.** The following entries are drawn from general knowledge of the AI agent orchestration space as of 2025-2026. Re-run `/adv-improve` with Kagi available to refresh this section.

1. **Kiro (AWS)**
   - What they do differently: AWS-managed agent orchestration with built-in observability (CloudWatch, X-Ray), auto-scaling, and enterprise compliance.
   - Relevance: ADV is local-first and open-source; Kiro is cloud-managed. Little direct overlap, but Kiro's observability patterns (structured metrics, SLOs) are applicable.
   - Source: General knowledge (refresh with Kagi)

2. **Cursor / Claude Code / GitHub Copilot**
   - What they do differently: IDE-integrated AI assistants with no explicit spec-driven workflow. They optimize for latency (streaming responses, fast context loading) but lack formal gate/change tracking.
   - Relevance: ADV's differentiator is spec enforcement and gate tracking. Performance gap: these tools feel "snappier" because they skip the durability layer. ADV could learn from their context-loading optimizations.
   - Source: General knowledge (refresh with Kagi)

3. **OpenCode Plugin Ecosystem (64+ plugins)**
   - What they do differently: Lightweight plugins that add features without heavy infrastructure. Many are single-file tools with minimal overhead.
   - Relevance: ADV is one of the heavier plugins due to Temporal + SQLite. Could benefit from a "lite mode" that skips Temporal for simple projects.
   - Source: General knowledge (refresh with Kagi)

---

## Emerging Patterns

⚠ **External landscape analysis: Kagi not reachable.** The following entries are drawn from general knowledge. Re-run `/adv-improve` with Kagi available to refresh this section.

1. **Multi-Agent Orchestration (1,445% growth in 2025)**
   - Maturity: Mainstream
   - Why noteworthy: ADV already supports sub-agents (explore, librarian, adv-engineer). The trend is toward more sophisticated orchestration (hierarchical planning, agent swarms). ADV's gate system is well-positioned but could add agent-pool management.
   - Source: General knowledge (refresh with Kagi)

2. **MCP Protocol Standardization**
   - Maturity: Growing
   - Why noteworthy: ADV uses MCP tools extensively. As MCP becomes a standard, ADV could expose its own tools as MCP servers, enabling cross-plugin composition. Performance implication: MCP adds serialization overhead; batching and streaming will matter.
   - Source: General knowledge (refresh with Kagi)

---

## Applicability to This Repo

| Competitor / Pattern         | Applicable? | Local Code Path                              | Notes                                     |
| ---------------------------- | ----------- | -------------------------------------------- | ----------------------------------------- |
| Kiro observability           | Partial     | `src/utils/debug-log.ts`                     | Could adopt structured metrics format     |
| Cursor latency optimizations | Yes         | `src/storage/store-temporal.ts`              | Cache batching, reduce round-trips        |
| OpenCode lite mode           | Yes         | `src/storage/store.ts`                       | Add `ADV_LITE=1` to skip Temporal         |
| Multi-agent orchestration    | Yes         | `src/guards/task.ts`, `src/tool-registry.ts` | Already supported; could expand           |
| MCP standardization          | Yes         | `src/tool-registry.ts`                       | Already MCP-based; optimize serialization |

---

## Open Questions for Research

1. **What is the actual p99 latency of `adv_change_show` under Temporal?** The `reduceTemporalRoundTrip` change added profiling but no baseline has been published.
2. **Does the SQLite WAL grow unbounded in long-running OpenCode sessions?** Need to measure WAL file size over a typical workday.
3. **What is the throughput limit of the in-process worker vs out-of-process worker?** No load tests exist.
4. **Would a `workflowBundle` (pre-bundled workflows) improve worker startup time?** The current worker loads workflows from disk on every start.
5. **Is the Bun-native SQLite faster than the better-sqlite3 mock in tests?** Could affect the decision to add Bun-native integration tests.

---

## Sources

- Local files:
  - `plugin/src/temporal/retry-wrapper.ts`
  - `plugin/src/temporal/out-of-process-worker.ts`
  - `plugin/src/temporal/health-probe.ts`
  - `plugin/src/temporal/in-process-worker.ts`
  - `plugin/src/storage/store-temporal.ts`
  - `plugin/src/storage/store-legacy.ts`
  - `plugin/src/storage/health.ts`
  - `plugin/src/utils/fs.ts`
  - `plugin/src/utils/debug-log.ts`
  - `plugin/src/events/terminal.ts`
  - `plugin/vitest.config.ts`
  - `plugin/package.json`
- Context7:
  - `/temporalio/sdk-typescript` — Worker configuration, retry patterns
  - `/oven-sh/bun` — SQLite WAL mode, PRAGMA best practices
- ADV State:
  - `reduceTemporalRoundTrip` change — 11 tasks completed, Temporal round-trip optimizations
  - `investigateTemporalPerformance` change — Draft, no tasks
- External:
  - ⚠ Kagi unavailable during this analysis. Competitors and emerging patterns drawn from general knowledge. Refresh recommended.

---

## Overlaps with Active Changes

| Finding                                         | Active Change                    | Status                                                           |
| ----------------------------------------------- | -------------------------------- | ---------------------------------------------------------------- |
| N+1 Temporal queries, profiling, hot-path fixes | `reduceTemporalRoundTrip`        | In progress (execution done, acceptance pending)                 |
| Temporal performance regression investigation   | `investigateTemporalPerformance` | Draft, no tasks — may be superseded by `reduceTemporalRoundTrip` |
| Retire legacy storage backend                   | `retireLegacyStorageBackend`     | Draft, no tasks — would eliminate fallback overhead              |

---

## Summary

**Critical finding:** The Temporal store adapter has an N+1 query pattern (`listResolvedChanges()` queries Temporal once per change). This is actively being addressed by `reduceTemporalRoundTrip`.

**High-priority gaps:**

1. Retry wrapper lacks jitter and circuit breaker
2. OOP worker restart budget too low
3. Legacy store reads JSON from disk on every access
4. Temporal health probe opens new connection per call

**Medium-priority gaps:**

1. No benchmark suite
2. Profiling is opt-in
3. SQLite WAL checkpointing is passive
4. File lock polling uses fixed retry

**Low-priority gaps:**

1. `Date.now()` instead of `performance.now()`
2. Debug log lacks rotation / structured format
3. TTY cache TTL is arbitrary

**Suggested next commands:**

- `/adv-discover reduceTemporalRoundTrip` — Continue the in-progress performance work
- `/adv-proposal add-jitter-to-retry-wrapper` — Address the thundering-herd risk
- `/adv-proposal proactive-wal-checkpoint` — Prevent WAL growth
- `/adv-proposal benchmark-suite` — Add continuous performance regression testing
