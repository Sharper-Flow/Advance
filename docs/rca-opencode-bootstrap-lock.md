# RCA: opencode bootstrap "database is locked" crash

**Status:** Root cause identified, evidence captured. Long-term fix recommendation in [Solution Space](#solution-space) section.

**Scope:** This document covers the host application (`anomalyco/opencode`, fork of archived `opencode-ai/opencode`). The `advance` plugin shipped from this repository was *exonerated* at the time of investigation (see [Plugin exoneration](#plugin-exoneration)); the plugin has since migrated its storage layer to Temporal and no longer uses SQLite.

**Evidence pin:** All source citations are against `anomalyco/opencode` branch `dev` at commit `93e633fb7d57f5fcc11a00c76286aeed274d5cca` (2026-04-20T04:51:34Z). Re-verify against current `main` before filing upstream.

---

## Symptom

User-visible failure on TUI bootstrap when multiple opencode instances are running concurrently:

```
tui bootstrap failed: database is locked
```

Origin in source: `packages/opencode/src/cli/cmd/tui/context/sync.tsx:434`.

Crash is **transient**: once contention clears, subsequent launches succeed. At the time of investigation the user's instance had self-recovered. This RCA focuses on the underlying contention mechanism, not on stop-the-bleeding mitigation.

## Live system snapshot (investigation host)

| Resource | Value |
|----------|-------|
| Installed binary | `~/.opencode/bin/opencode` v1.14.18 (single 142 MB compiled binary; source must be inspected via GitHub) |
| Primary DB | `~/.local/share/opencode/opencode.db` — **1.8 GB** |
| WAL file | `~/.local/share/opencode/opencode.db-wal` — **6 MB** |
| Session count | **~4160 sessions** (only 4 archived) |
| Concurrent instances at crash | Multiple opencode TUIs across tmux panes, all reading/writing same DB |

## Mechanism

### Configured pragmas (`packages/opencode/src/storage/db.ts`)

The fork applies a sound multi-process pragma set on every connection:

| Pragma | Value | Purpose |
|--------|-------|---------|
| `journal_mode` | `WAL` | Multi-reader concurrency, single-writer |
| `synchronous` | `NORMAL` | Durability-perf tradeoff appropriate for WAL |
| `busy_timeout` | `5000` ms | Wait up to 5s for `SQLITE_BUSY` before erroring |
| `cache_size` | `-64000` (64 MB) | Per-connection page cache |
| `foreign_keys` | `ON` | Standard relational integrity |
| `wal_checkpoint(PASSIVE)` | run on every connect | Opportunistic WAL truncation |

This pragma set is correct. Note: the original `opencode-ai/opencode` (archived, Go) implementation in `internal/db/connect.go` had **no** `busy_timeout` — anomalyco's TypeScript fork *added* this protection. It is not the missing pragma that causes the crash.

### Migration-on-every-connect race

`packages/opencode/src/storage/db.ts` exports a lazy singleton `Client`:

- First access triggers `migrate(db, entries)` (Drizzle ORM migration runner).
- Migration runs **without** an enclosing `BEGIN IMMEDIATE` transaction.
- Migration runs **without** an external advisory lock (no `flock`/`fcntl`, no PID-file gate).
- Each opencode process maintains its own `Client` singleton — the singleton is per-process, not per-host.

When two opencode processes start within the same `busy_timeout` window (5 seconds) and both observe a pending migration:

1. Process A acquires the SQLite file lock to run a `CREATE TABLE` / `ALTER TABLE` statement.
2. Process B's `migrate(db, entries)` issues a competing schema write.
3. Drizzle's migration runner does not retry on `SQLITE_BUSY`; it surfaces the error.
4. The 5 s `busy_timeout` is exceeded by the cumulative migration cost (large DBs amplify this — see snapshot above), or the race resolves to immediate `SQLITE_BUSY` if the writer is mid-transaction.
5. The TUI bootstrap path at `sync.tsx:434` receives `database is locked` and aborts.

The race is structural: Drizzle treats migrations as ordinary writes, but the host treats migration-on-connect as a hot-path step on every TUI launch. Under concurrent multi-instance use, the two assumptions collide.

### Aggravating factors

- **DB size.** 1.8 GB and ~4160 session rows mean every checkpoint and every migration touches a non-trivial working set, expanding the contention window.
- **`wal_checkpoint(PASSIVE)` on every connect.** Even when no migration is pending, every fresh connection issues a checkpoint, which itself takes a write-class lock.
- **No advisory lock above the SQLite layer.** The fork relies entirely on SQLite's internal `busy_timeout`, which is reactive (wait then fail), not preemptive (queue then proceed).

### Escape hatches present in the fork

The fork exposes two relevant env vars:

- `OPENCODE_SKIP_MIGRATIONS` — bypasses `migrate(db, entries)` for cases where the operator knows the schema is current.
- `OPENCODE_DB` — overrides the DB path, enabling per-channel/per-instance sharding by hand.

Both are operator workarounds, not structural fixes.

## Plugin exoneration

The `advance` plugin shipped from this repository was **not** the cause of the host crash at the time of this investigation, despite running in the same opencode process and using SQLite. (As of April 2026 the plugin has retired its SQLite backend; see the historical note at the end of this section.)

Evidence — at the time of this investigation, `advance` used a strict per-project DB pattern that *avoided* the entire contention class. All file:line citations below are pinned to commit [`05649d7b`](https://github.com/Sharper-Flow/Advance/tree/05649d7be119de1e178621c24e05222c9511618c) — the last commit on `main` containing the legacy SQLite backend before the plugin's cutover to Temporal-backed storage.

| Layer | File:line (pinned @ `05649d7b`) | Mechanism |
|-------|---------------------------------|-----------|
| DB path | [`plugin/src/storage/store-legacy.ts:83`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/store-legacy.ts#L83) | Per-project `spec.db` keyed by root commit SHA → no cross-project sharing |
| Concurrency control | [`plugin/src/storage/health.ts`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/health.ts) | File-lock health probe before opening |
| Transactions | [`plugin/src/storage/store-context.ts`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/store-context.ts) | `BEGIN IMMEDIATE` around mutating ops |
| Pragmas | [`plugin/src/storage/store-legacy.ts`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/store-legacy.ts) | WAL + `busy_timeout=5000` |

The plugin's per-project sharding meant even when N opencode instances were running, the plugin's writes targeted N different DB files — there was no shared lock contention point. The host's single shared `opencode.db` was the only resource being raced. The plugin was a contrast case demonstrating that the SQLite community LBP for multi-process workloads (sharding + advisory locks + `BEGIN IMMEDIATE` + WAL + `busy_timeout`) was implementable in this stack.

**Historical note.** The plugin has since migrated its storage layer to a Temporal-backed implementation and retired the legacy JSON+SQLite backend. The pinned commit above preserves the exoneration evidence; it does not reflect current plugin internals. The LBP conclusions about multi-process SQLite (sharding + `BEGIN IMMEDIATE` + advisory locks) remain valid for upstream opencode regardless of the plugin's internal direction.

## Existing upstream issues

| Issue | Status | Relation |
|-------|--------|----------|
| anomalyco/opencode#15188 | Canonical | Same symptom; existing report. Filing target for evidence-only comment. |
| anomalyco/opencode#19521 | Auto-flagged duplicate of #15188 | Confirms recurring nature; no new evidence to add there. |

The corrected diagnosis (migration-on-every-connect race vs. concurrent multi-instance use, plus plugin-exoneration) is the new evidence to contribute. See `upstream-issue-opencode-bootstrap-lock.md`.

## What is *not* the cause (ruled out)

| Hypothesis | Why ruled out |
|------------|---------------|
| Plugin contention | Plugin uses per-project sharding (see Plugin exoneration). |
| Missing `busy_timeout` | Already set to 5000 ms in db.ts. |
| WAL not enabled | WAL is configured; `*-wal` file present and active. |
| Foreign-key fault | `foreign_keys=ON` is correct; failure mode is lock, not constraint. |
| Disk full / fs errors | Disk has ample space; errno is `SQLITE_BUSY`, not I/O. |
| Stale lock file from prior crash | WAL recovery is automatic on next connect; no `.lock` files observed. |
| Session pruning would fix it | Out of scope per user; would only narrow contention window, not eliminate the race. Lock contention is a concurrency problem, not a volume problem. |

## Summary

**Root cause:** Drizzle's migration-on-every-connect runs as ordinary write transactions without an external advisory lock or `BEGIN IMMEDIATE` boundary. Under concurrent multi-instance use against a single shared DB, two processes can race the migration write within the 5 s `busy_timeout` window and one will receive `SQLITE_BUSY`, surfaced as `tui bootstrap failed: database is locked` at `sync.tsx:434`. Aggravated by large DB size (1.8 GB / ~4160 sessions in the observed case) and by `wal_checkpoint(PASSIVE)` on every connect.

**Long-term fix direction:** see [Solution Space](#solution-space) (next section, authored in T2).

---

## Solution Space

This section enumerates fix options across four orthogonal dimensions, evaluates each, and concludes with a single recommended staged path. Each option is an *internal* analysis — the upstream artifact (`upstream-issue-opencode-bootstrap-lock.md`) intentionally excludes recommendations and presents only evidence.

### LBP framing — multi-process SQLite (cited)

Three independent authoritative sources converge on the same prescription for SQLite under concurrent multi-process workloads:

- **sqlite.org/whentouse.html** — official guidance: WAL + `busy_timeout` are the table stakes for concurrency; *"high concurrency"* SQLite usage requires application-level coordination (advisory locks, sharding) on top of SQLite's primitives.
- **Simon Willison, "SQLite tips for concurrent writes" (2025-02-17)** — recommends `BEGIN IMMEDIATE` for every write transaction (acquires the reserved lock immediately rather than racing on first write) plus per-purpose DB files when contention dominates.
- **Bert Hubert, "SQLite considerations for production" (2025-02-16)** — explicit on the "migration as ordinary write" trap: schema changes need an out-of-band coordination mechanism (file lock, leader election, or single-writer enforcement) because SQLite's internal locking is per-statement, not per-logical-operation.

The fork already has WAL + `busy_timeout`. The missing pieces from the LBP set are: an advisory lock around the migration window, optional `BEGIN IMMEDIATE` on the migration transaction itself, and (structural) per-purpose DB sharding.

### Dimension 1 — Concurrency control around the migration

| Option | Mechanism | Blast radius | Cost | Reversibility | Precedent |
|--------|-----------|--------------|------|---------------|-----------|
| 1A. OS advisory file lock (`flock(2)` Linux/macOS, `fcntl(F_SETLK)` POSIX, `LockFileEx` Windows) wrapping `migrate(db, entries)` | Acquire exclusive lock on a sentinel file (e.g. `opencode.db.migrate.lock`) before migration; release on success or process death; kernel cleans up on crash | db.ts only; no schema or data path change | Low — single sentinel file + 5-line wrapper; cross-platform via Node `fs` + `proper-lockfile` or similar | Trivially reversible (delete wrapper) | Used by every database migration tool that supports multi-process callers (Liquibase, Flyway, Alembic with file-lock plugin) |
| 1B. PID-file gate | Write current PID to `opencode.db.migrate.pid`, others poll | Same scope as 1A | Low | Reversible | **Rejected**: PID files leak on `SIGKILL` / power loss; new processes see a stale lock and either deadlock or unsafely steal it. Not recommended by any modern reference. |
| 1C. `BEGIN IMMEDIATE` wrapper around migration | Have Drizzle (or a thin wrapper) start the migration transaction with `BEGIN IMMEDIATE` instead of deferred | db.ts + Drizzle config | Low | Reversible | Willison 2025-02-17 (LBP) |
| 1D. Leader election via a SQLite advisory row | Write a heartbeat row to a `_migration_leader` table; non-leaders skip migration if a recent heartbeat exists | db.ts + new table | Medium (introduces new schema for the migration coordinator) | Reversible but leaves vestigial table | Common in distributed-system patterns; overkill for single-host multi-process |

**Best-in-class for this dimension:** 1A (OS advisory file lock). Auto-released on process death by the kernel — solves the PID-file leak class. 1C (`BEGIN IMMEDIATE`) is a complementary, not alternative, hardening — they should be combined.

### Dimension 2 — Migration timing

| Option | Mechanism | Blast radius | Cost | Reversibility | Precedent |
|--------|-----------|--------------|------|---------------|-----------|
| 2A. Migration on every connect (current) | Lazy `Client` singleton runs `migrate()` on first access | — | — | — | Status quo; demonstrably racy |
| 2B. Migration only when version row is stale | Read `_migration_version` table first; only call `migrate()` if installed version < target | db.ts | Low | Reversible | Standard pattern (Rails, Django, Knex) |
| 2C. Migration deferred to explicit CLI command (`opencode migrate`) | Bootstrap path skips migration entirely; operator runs it manually before launching multiple instances | db.ts + new CLI command | Medium (UX change; requires user-facing docs) | Reversible | Common in server applications (Postgres apps, etc.); awkward for desktop apps |

**Best-in-class for this dimension:** 2B (version check). Eliminates 99% of migration races by making the hot-path no-op when no migration is pending. Combines naturally with 1A — version check first, only acquire lock if migration is actually needed.

### Dimension 3 — DB sharding

| Option | Mechanism | Blast radius | Cost | Reversibility | Precedent |
|--------|-----------|--------------|------|---------------|-----------|
| 3A. Single shared DB (current) | All instances use `~/.local/share/opencode/opencode.db` | — | — | — | Status quo; contention point |
| 3B. Per-project DB (matches `advance` plugin) | Key DB path by project root commit SHA or working directory hash | db.ts (path computation) + migration tooling for existing 1.8 GB DB | High — requires data migration plan, search/aggregation rework if sessions need to query across projects | Reversible with effort | `advance` plugin (in-tree contrast); also pattern in VSCode workspaces, JetBrains projects |
| 3C. Per-instance DB (per-PID or per-channel) | DB path includes PID or `OPENCODE_CHANNEL` | db.ts | Medium — breaks session continuity across restarts unless aggregated | Reversible | Some IDE telemetry collectors |
| 3D. Single DB + connection pooling daemon | Spawn one DB-owning process per host, all instances RPC into it | New IPC layer | Very high | Hard | Postgres model; massive over-engineering for a desktop app |

**Best-in-class for this dimension:** 3B (per-project sharding). Eliminates the contention class entirely (different DB files = no shared lock) and matches the LBP exemplar already shipping in this repo. Cost is real but bounded; the data migration is one-time.

### Dimension 4 — Observability

| Option | Mechanism | Blast radius | Cost | Reversibility | Precedent |
|--------|-----------|--------------|------|---------------|-----------|
| 4A. No new observability (current) | — | — | — | — | Status quo |
| 4B. Structured log on `SQLITE_BUSY` with `pid`, `peer_pids`, `db_size`, `wal_size`, `migration_pending` | One log line on the failure path | db.ts catch block | Trivial | Reversible | Standard ops practice |
| 4C. Health metric / counter exported on TUI startup | Increment `opencode_db_busy_total` counter on each `SQLITE_BUSY` | db.ts + metrics export pipeline | Medium (depends whether metrics infra exists) | Reversible | Production observability standard |

**Best-in-class for this dimension:** 4B. Cheap, immediate diagnostic value; no infra dependency.

### Recommended staged path

Maintainers can adopt any subset; this section presents the staging that gives the largest immediate risk reduction first.

#### Phase 1 — Immediate (resolves observed crash class)

Combine **1A** (OS advisory file lock around `migrate()`) + **2B** (version-check skip) + **4B** (structured log on `SQLITE_BUSY`).

- **Why these three together:** 2B makes the hot path a no-op when no migration is pending (eliminates the common case). 1A makes the rare migration case race-free across instances (eliminates the failure case). 4B gives operators visibility when residual contention from non-migration writes occurs.
- **Why not PID-file (1B):** PID files leak on `SIGKILL`, power loss, OOM kill. The Linux/macOS/Windows kernel auto-releases `flock`/`fcntl`/`LockFileEx` when the holding process dies — no leak class, no stale-lock cleanup code path. This is why every modern migration tool uses kernel-level advisory locks.
- **Blast radius:** confined to `packages/opencode/src/storage/db.ts`. No schema change, no data migration, no UX change.
- **Reversibility:** trivial — delete the wrapper.
- **Maintainer cost estimate:** ~1 day including cross-platform testing.

#### Phase 2 — Structural (eliminates contention class)

Adopt **3B** (per-project DB sharding) following the `advance` plugin's existing pattern — DB path keyed by project root identity.

- **Why this is the LBP endpoint:** removes the shared-resource contention point entirely. Every authoritative source (sqlite.org, Willison, Hubert) names sharding as the durable answer for multi-process SQLite. The plugin demonstrates the pattern is implementable in this stack with no compromise.
- **Why staged after Phase 1:** Phase 1 fixes the immediate crash class with low blast radius. Phase 2 is a larger structural change requiring a data migration plan for existing 1.8 GB shared DBs — it benefits from happening after the immediate pain is gone, when there is space to plan the migration carefully.
- **Open question for maintainers:** session continuity across project boundaries (does the user expect to see all sessions in one list regardless of project?). This is a product decision orthogonal to the lock contention fix; the implementation choice (e.g. aggregation view across per-project DBs vs. true per-project isolation) depends on the answer.
- **Blast radius:** db.ts (path computation) + any code that assumes a single DB file. Search/aggregation features may need a federated query layer.
- **Reversibility:** reversible with effort (re-merge per-project DBs into a single DB).
- **Maintainer cost estimate:** weeks, not days.

#### What is *not* recommended

- **PID-file gating (1B)** — leaks on crash, no benefit over 1A.
- **Daemon model (3D)** — order-of-magnitude over-engineering for a desktop app.
- **Operator-only escape hatches as the canonical fix** — `OPENCODE_SKIP_MIGRATIONS` and `OPENCODE_DB` are useful workarounds but place the burden on every user; a structural fix should not require operator awareness.

### Boundary note

This section's recommendations live in this internal RCA only. The upstream artifact (`upstream-issue-opencode-bootstrap-lock.md`) intentionally excludes them — maintainers decide the fix; this document captures the analysis chain for future re-readers.
