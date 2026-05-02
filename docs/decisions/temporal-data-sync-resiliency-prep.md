# Research Pack: Temporal, Data Layer, Sync & Resiliency

- **Target:** temporal, data warehousing, sync, system resource optimization, resiliency
- **Mode:** Scoped (5 capability areas)
- **Created:** 2026-04-23
- **Updated:** 2026-04-23

> **Historical note:** This research pack captures the pre-`completeTemporalOnlyMigration`
> state. References to `store-legacy.ts`, `store-sync.ts`, SQLite, or Temporal
> fallback behavior are evidence from that pre-migration snapshot, not current
> architecture. Runtime storage is now Temporal-only with `store-disk.ts` as the
> disk artifact substrate.

## Purpose & Scope

This pack covers ADV's Temporal workflow integration, storage architecture (JSON+SQLite dual backend and Temporal-backed store adapter), JSON→SQLite sync subsystem, system resource optimization opportunities, and error handling/resiliency patterns. It deliberately does **not** cover: ADV's agent orchestration layer, command workflow semantics, spec validation, or the overlay/sync-global.sh tooling.

## Current State

### Reliability (3 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| R1 | HIGH | Silent fallback to legacy store on Temporal errors. `isExpectedFallbackError()` catches `WorkflowNotFound`/`QueryNotRegistered` and falls back to `legacy.*` without logging or metric. Impossible to distinguish "workflow never started" from "workflow crashed" in production. | `plugin/src/storage/store-temporal.ts:75-82` |
| R2 | MEDIUM | Legacy store always initialized even when Temporal is primary. `createStore()` calls `createLegacyStore()` unconditionally, then wraps. Opens SQLite, runs health checks, allocates sync caches — all unused on Temporal path. | `plugin/src/storage/store.ts:42-44` |
| R3 | MEDIUM | `isExpectedFallbackError` regex is broad — `/not[_ ]found|NOT_FOUND/i` could match unexpected error messages. No unit tests exercising false-positive matches. | `plugin/src/storage/store-temporal.ts:79` |

### Code Quality (3 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| C1 | MEDIUM | `store-temporal.ts` at 876 lines is the largest storage file. `createTemporalStoreBackend` is a ~600-line function with deep nesting. Legacy store was decomposed into domain modules (specs/changes/tasks/gates); Temporal adapter was not. | `plugin/src/storage/store-temporal.ts` |
| C2 | LOW | `out-of-process-worker.ts` (82 lines) is now a thin wrapper delegating to `worker-multi.ts`. Interface could be simplified or consolidated. | `plugin/src/temporal/out-of-process-worker.ts:40-50` |
| C3 | LOW | Deprecated `RetryOptions.backoffMs` field remains in retry-wrapper despite `@deprecated` annotation and replacement fields existing. | `plugin/src/temporal/retry-wrapper.ts:125` |

### Observability (2 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| O1 | HIGH | No metric or structured log when Temporal→legacy fallback occurs. Operators have zero signal that the system degraded to legacy backend. | `plugin/src/storage/store-temporal.ts` — every method catch path |
| O2 | MEDIUM | WAL checkpoints only triggered during sync operations. No background scheduler. Under low-activity sessions, WAL grows unbounded. | `plugin/src/storage/store-sync.ts` — `shouldCheckpoint` calls |

### Performance (2 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| P1 | MEDIUM | Session-scoped sync caches (`syncedSpecs`, `syncedChanges`) cleared on every restart. Full re-sync cost paid per session. | `plugin/src/storage/store-context.ts:56-67` |
| P2 | LOW | `benchmark-temporal.ts` is 30KB development tool — verify not imported at runtime. | `plugin/scripts/benchmark-temporal.ts` |

### Testing (2 findings)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| T1 | MEDIUM | Acknowledged transitive import debt in workflow bundle — `change-state.ts → ../storage/gate-reentry` could pull side-effect-heavy modules into sandbox. | `plugin/src/temporal/workflows.test.ts:5-19` |
| T2 | POSITIVE | Replay validation via `restartDoesNotRedoCompletedActivities` integration test. | `plugin/src/temporal/__tests__/worker-lifecycle/worker-restart-no-redo.itest.ts` |

### Security (1 finding)

| # | Severity | Finding | Evidence |
|---|----------|---------|----------|
| S1 | LOW | Remote Temporal connections allowed via env var with string-based loopback check. No explicit restriction on non-loopback. | `plugin/src/temporal/client.ts` — `allowRemoteTemporal`, `isLoopbackAddress` |

### Positive Findings (not issues)

- **Storage decomposition:** Legacy store reduced 78% (1491→399 lines) with domain modules extracted.
- **Determinism guards:** No `new Date()` in workflows, import guard test, deterministic timestamp injection.
- **Worker consolidation:** Per-queue children → single multi-queue child, reducing process overhead.
- **Error classification:** Four-class taxonomy (TRANSIENT/SEMANTIC/ENVIRONMENTAL/FATAL) + Temporal-specific (transient/fallback/fatal) with telemetry histograms.
- **Bounded recovery:** `corruption-recovery.ts` with configurable attempts and backoff.
- **RCA maturity:** `../rca-opencode-bootstrap-lock.md` demonstrates thorough multi-process SQLite analysis.

## LBP / Reference Comparison

| Area | Classification | Current | Canonical (Temporal docs) | Delta |
|------|---------------|---------|--------------------------|-------|
| Workflow determinism | SOUND | Timestamp injection, import guards | Deterministic sandbox, replay-safe logging | Matches |
| Worker lifecycle | SOUND | Multi-queue single-process, graceful shutdown, backoff | Production bundle vs dev workflowsPath | Matches |
| Search attributes | SOUND | Custom ADV attrs (projectId, changeId, changeStatus, activeGate, doomLoop) | upsertSearchAttributes for observability | Matches |
| ContinueAsNew | SOUND | `shouldContinueAsNew` guard | Recommended for long-lived workflows | Matches |
| Activity retries | DRIFTED | Custom `withTemporalRetry` at caller level | Native `retry` option on activities with `initialInterval`/`backoffCoefficient`/`maximumAttempts` | ADV reimplements retry |
| Error observability | DRIFTED | Silent fallback on "not found" errors | Query failures should be logged explicitly | Masks operational issues |
| Store backend coupling | ANTI-PATTERN | Legacy store always constructed, Temporal wraps it | Clean separation when Temporal is active | Unnecessary resource consumption |

### Greenfield Perspective

If rebuilt from scratch today with Temporal as the primary store:
- Legacy JSON+SQLite backend would be a separate test-only module, never instantiated in production
- `store-sync.ts` would be unnecessary (Temporal is authoritative, no JSON→SQLite bridge needed)
- Session-scoped caches would use Temporal queries instead of re-reading JSON files
- Activity retries would use Temporal's native retry policy instead of custom `withTemporalRetry`
- The Store interface would have a single Temporal implementation, not a wrapper around a wrapper

## Competitors & Alternatives

| Name | What they do differently | Source | Relevance to ADV |
|------|-------------------------|--------|-----------------|
| **Inngest** | Event-driven durable execution as library — no Temporal server dependency. Runs in-process. | https://www.zenml.io/blog/temporal-alternatives | High — ADV's heaviest infra requirement is the Temporal server. Library-first durable execution could eliminate it entirely. |
| **LibSQL/Turso** | Distributed SQLite with embedded replicas and automatic server-side sync. Local reads, remote writes. | https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk | Medium — ADV already uses SQLite as derived cache. Embedded replicas could replace the custom JSON→SQLite sync layer. |
| **Akka** | Actor-based durable state with persistence. State machine + event sourcing without external server. | https://akka.io/blog/temporal-alternatives | Low — JVM ecosystem mismatch. Conceptual model (actors as workflows, events as history) mirrors ADV's Temporal patterns. |

## Emerging Patterns

| Name | Maturity | Source | Why Noteworthy |
|------|----------|--------|----------------|
| **Local-first sync engines** (PowerSync, ElectricSQL) | Early production | https://www.localfirstconf.com/, https://lofi.so/ | Replace custom JSON→SQLite sync (`store-sync.ts`) with managed CRDT-based replication. Could eliminate sync complexity entirely. |
| **Embedded replicas** (Turso/libSQL) | Production | https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk | Run local SQLite replica with automatic server-side sync. Matches ADV's JSON-source-of-truth pattern but with managed consistency. |

## Applicability to This Repo

- **Inngest** would require a fundamental architectural shift — replacing Temporal workflows with Inngest functions. Not practical as a migration but relevant for future greenfield decisions.
- **LibSQL/Turso embedded replicas** could replace `store-sync.ts` + `store-legacy.ts` SQLite cache. The local SQLite replica would serve reads, and the server-side component would handle durability. However, this introduces a network dependency that ADV currently avoids.
- **Local-first sync engines** are conceptually closest to what `store-sync.ts` does manually. PowerSync/ElectricSQL would automate the JSON→SQLite→query bridge but require a managed service.
- **Akka** patterns are not applicable due to JVM/TypeScript ecosystem mismatch.

## Open Questions for Research

1. **What is the measured startup cost of `createLegacyStore()` when Temporal is active?** If <50ms, lazy-init may not be worth the complexity.
2. **What is the actual fallback frequency in production?** Without observability (R1/O1), we can't quantify the impact. Adding a counter first would inform priority.
3. **Can `store-temporal.ts` be decomposed without changing the Store interface?** The Store type is shared — decomposition must preserve the public API.
4. **Is `withTemporalRetry` redundant with Temporal's native activity retry?** If activities declare retry policies, the wrapper may only need to handle client-side connection errors.
5. **Would persisting sync state across sessions (e.g., in SQLite's `sync_files` table) significantly reduce startup latency?** Need benchmarks comparing full re-sync vs cached sync for typical project sizes.
6. **What is the blast radius of the transitive import debt (T1)?** If `change-state.ts` imports `../storage/gate-reentry`, what exactly does it pull in? Is it currently a latent risk or a theoretical one?

## Sources

- `plugin/src/storage/store.ts` — backend selector
- `plugin/src/storage/store-temporal.ts` — Temporal adapter (876 lines)
- `plugin/src/storage/store-legacy.ts` — JSON+SQLite backend (399 lines)
- `plugin/src/storage/store-sync.ts` — JSON→SQLite sync (360 lines)
- `plugin/src/storage/store-context.ts` — sync cache types
- `plugin/src/storage/sqlite.ts` — SQLite store with FTS5 (1186 lines)
- `plugin/src/storage/health.ts` — SQLite pragma configuration
- `plugin/src/storage/corruption-recovery.ts` — bounded recovery
- `plugin/src/temporal/workflows.ts` — changeWorkflow + projectWorkflow (516 lines)
- `plugin/src/temporal/client.ts` — connection management, loopback check
- `plugin/src/temporal/service.ts` — shared Temporal service layer (STSL)
- `plugin/src/temporal/retry-wrapper.ts` — retry classification + telemetry
- `plugin/src/temporal/runtime-manager.ts` — Temporal server + worker process management
- `plugin/src/temporal/worker-multi.ts` — multi-queue worker host
- `plugin/src/temporal/in-process-worker.ts` — in-process worker
- `plugin/src/temporal/change-state.ts` — workflow state mutations
- `plugin/src/temporal/observability.ts` — search attributes
- `plugin/src/plugin-init.ts` — plugin bootstrap + worker lifecycle
- `plugin/src/events/status.ts` — doom loop tracking
- `plugin/src/types.ts` — error recovery taxonomy
- `../rca-opencode-bootstrap-lock.md` — multi-process SQLite RCA
- Context7: `/temporalio/documentation` — TypeScript SDK production best practices
- https://www.zenml.io/blog/temporal-alternatives
- https://akka.io/blog/temporal-alternatives
- https://dev.to/dataformathub/distributed-sqlite-why-libsql-and-turso-are-the-new-standard-in-2026-58fk
- https://www.localfirstconf.com/
- https://lofi.so/
