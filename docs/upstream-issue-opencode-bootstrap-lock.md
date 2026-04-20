# Upstream artifact: opencode bootstrap "database is locked"

**Purpose.** Two ready-to-paste bodies for upstream reporting against `anomalyco/opencode`. Both are **evidence-only**: corrected diagnosis + plugin-exoneration. No suggested remediation, no PR-spec — maintainers own the fix design.

**Filing decision flow.**

1. **Primary:** post Section A as a comment on existing issue `anomalyco/opencode#15188`.
2. **Fallback:** if `#15188` is closed, locked, or unresponsive after 7 days, file a new issue using Section B verbatim.
3. Do not re-comment on `#19521` (auto-flagged duplicate of `#15188`); it adds no signal.

**Evidence pin.** Both sections cite `anomalyco/opencode` branch `dev` at commit `93e633fb7d57f5fcc11a00c76286aeed274d5cca` (2026-04-20T04:51:34Z). Re-verify against current `main` before posting.

---

## Section A — Comment body for `anomalyco/opencode#15188`

> Paste this verbatim into a new comment on the existing issue. No title, no repro boilerplate (the issue already has those). Goal: contribute a sharper diagnosis and one piece of contrast evidence.

---

Adding a corrected diagnosis with source citations from `dev` @ `93e633fb7d57f5fcc11a00c76286aeed274d5cca`.

**Where the user-visible error originates**

`packages/opencode/src/cli/cmd/tui/context/sync.tsx:434` — the `tui bootstrap failed: database is locked` string is thrown from this catch block.

**Underlying mechanism (corrected)**

The configured pragma set in `packages/opencode/src/storage/db.ts` is sound:

| Pragma | Value |
|---|---|
| `journal_mode` | `WAL` |
| `synchronous` | `NORMAL` |
| `busy_timeout` | `5000` ms |
| `cache_size` | `-64000` |
| `foreign_keys` | `ON` |
| `wal_checkpoint(PASSIVE)` | run on every connect |

(Note: the archived `opencode-ai/opencode` Go implementation in `internal/db/connect.go` had no `busy_timeout`. This fork added it. So `busy_timeout` is **not** the missing pragma.)

The contention is structural, not pragma-driven:

1. `db.ts` exports a lazy singleton `Client` whose first access triggers `migrate(db, entries)` (Drizzle ORM migration runner).
2. The migration runs as ordinary write transactions — there is no enclosing single-writer coordination above the SQLite layer.
3. The singleton is per-process, so each opencode instance independently observes a "pending migration" and races to apply it.
4. With a large shared DB (observed: 1.8 GB, ~4160 sessions) the cumulative migration cost can exceed the 5 s `busy_timeout` window.
5. The losing process receives `SQLITE_BUSY`, which surfaces at `sync.tsx:434` as `tui bootstrap failed: database is locked`.

**Aggravating factor**

`wal_checkpoint(PASSIVE)` runs on every fresh connection in `db.ts`. Even when no migration is pending, every TUI launch takes a write-class lock for the checkpoint, widening the contention window across concurrent instances.

**Reproduction conditions (from observed crash)**

- Multiple opencode TUIs running concurrently (e.g., across tmux panes), all bound to the same `~/.local/share/opencode/opencode.db`.
- Large accumulated DB (1.8 GB / ~4160 sessions in the observed case — but the race is structural, so smaller DBs are vulnerable too, just with a narrower window).
- Crash is transient: subsequent launches succeed once contention clears.

**Escape hatches that already exist in the fork**

- `OPENCODE_SKIP_MIGRATIONS` — bypasses the migration runner.
- `OPENCODE_DB` — overrides the DB path.

Both are operator workarounds.

**One piece of contrast evidence**

The `advance` opencode plugin (`https://github.com/Sharper-Flow/Advance`) ran in the same opencode process and used SQLite at the time of this report, but did **not** exhibit this failure mode. Its DB layout assigned each project its own `spec.db` file keyed by root commit SHA ([`plugin/src/storage/store-legacy.ts:83` @ `05649d7b`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/store-legacy.ts#L83)), so concurrent opencode instances targeted N different DB files rather than racing a single shared file. Mentioning it only as a contrast case demonstrating that this stack could host SQLite under concurrent multi-process load without the bootstrap-lock symptom; it does not prescribe an implementation choice for opencode itself. (The plugin has since migrated its storage layer to Temporal and the legacy SQLite backend cited here is historical — the pinned commit preserves the evidence.)

Happy to provide additional traces or test against a candidate fix if useful.

---

## Section B — Fallback new-issue body

> Use only if `#15188` is closed/locked/unresponsive. Includes title, summary, repro, evidence chain.

---

**Title:** `tui bootstrap failed: database is locked` under concurrent multi-instance use — migration-on-every-connect race

**Summary**

Running multiple opencode TUI instances concurrently against the same `~/.local/share/opencode/opencode.db` can cause one instance to crash on bootstrap with:

```
tui bootstrap failed: database is locked
```

The crash is transient (subsequent launches succeed). Root cause is a race in the lazy singleton migration path, not a missing pragma.

**Reproduction conditions**

- Two or more opencode TUI instances launched within a few seconds of each other, all bound to the same `~/.local/share/opencode/opencode.db`.
- A non-trivial existing DB amplifies the failure rate. Observed instance: 1.8 GB DB, ~4160 sessions, 6 MB WAL.
- Failure does not require an actual schema migration to be pending; the per-connect `wal_checkpoint(PASSIVE)` also takes a write-class lock and contributes to the contention window.

**Evidence (cited against `dev` @ `93e633fb7d57f5fcc11a00c76286aeed274d5cca`)**

1. Error origin: `packages/opencode/src/cli/cmd/tui/context/sync.tsx:434`.
2. DB layer: `packages/opencode/src/storage/db.ts` configures pragmas and exports a lazy singleton `Client` whose first access triggers `migrate(db, entries)`.
3. Pragma set in `db.ts`:

   | Pragma | Value |
   |---|---|
   | `journal_mode` | `WAL` |
   | `synchronous` | `NORMAL` |
   | `busy_timeout` | `5000` ms |
   | `cache_size` | `-64000` |
   | `foreign_keys` | `ON` |
   | `wal_checkpoint(PASSIVE)` | every connect |

   The pragmas themselves are correct for multi-process WAL workloads. Note that the archived upstream `opencode-ai/opencode` (Go) had no `busy_timeout`; this fork added it.

4. The `Client` singleton is per-process. With N concurrent opencode instances, each independently observes any pending migration and races the write. Drizzle does not retry on `SQLITE_BUSY`; the error surfaces at `sync.tsx:434`.

5. `wal_checkpoint(PASSIVE)` runs on every fresh connection in `db.ts`, so even with no pending migration each TUI launch acquires a write-class lock.

**Aggravating factors observed**

- Large DB (1.8 GB) lengthens the migration / checkpoint window.
- High session count (~4160) increases per-checkpoint cost.

**What is *not* the cause (ruled out)**

| Hypothesis | Why ruled out |
|---|---|
| Missing `busy_timeout` | Already set to 5000 ms in `db.ts`. |
| WAL not enabled | `journal_mode=WAL` is set; `*-wal` file present. |
| Foreign-key fault | `foreign_keys=ON` is correct; failure mode is lock, not constraint. |
| Disk full / I/O error | Disk has space; errno is `SQLITE_BUSY`. |
| Stale lock file from prior crash | WAL recovery is automatic; no `.lock` files observed. |
| Plugin-induced contention | The `advance` opencode plugin placed each project's data in a separate DB file ([`plugin/src/storage/store-legacy.ts:83` @ `05649d7b`](https://github.com/Sharper-Flow/Advance/blob/05649d7be119de1e178621c24e05222c9511618c/plugin/src/storage/store-legacy.ts#L83)), so it did not contend on `opencode.db`. Failure reproduces independent of plugin activity. (Plugin has since migrated to Temporal; cited commit preserves the historical SQLite layout.) |

**Existing escape hatches in the fork**

- `OPENCODE_SKIP_MIGRATIONS` — bypasses `migrate(db, entries)`.
- `OPENCODE_DB` — overrides the DB path.

Both are operator workarounds rather than structural answers.

**Related issues**

- `anomalyco/opencode#15188` — same symptom, original report (closed/locked/unresponsive at time of filing).
- `anomalyco/opencode#19521` — auto-flagged duplicate of `#15188`.

This issue contributes the migration-on-every-connect diagnosis and the plugin-exoneration contrast not previously captured.

Happy to provide additional traces or test against a candidate diagnosis if useful.
