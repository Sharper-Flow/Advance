# Archive: Fix stale status

**Change ID:** fixStaleStatus
**Archived:** 2026-06-22T16:05:13.429Z
**Created:** 2026-06-22T15:27:56.991Z

## Tasks Completed

- ✅ Guard CLI status Visibility query against completed workflows
  > Added `ExecutionStatus = "Running"` to the CLI `summariesFromVisibility` Temporal Visibility query so completed archived workflows are excluded even if custom `AdvChangeStatus` remains stale active. Extended `bin/lib/live-status.test.ts` fake Visibility client to record query strings and simulate server-side execution-status filtering; added regression covering completed stale-active workflow exclusion and running active inclusion. Verified RED/GREEN plus full bin test surface.
- ✅ Guard shared change workflow enumeration against completed workflows
  > Added `ExecutionStatus = "Running"` to `buildVisibilityQuery` when the requested status set is active-only (`draft`, `pending`, `active`). Preserved terminal/all-status behavior by omitting the guard for `statuses: null` and archived-only status override. Added regression assertions for default active queries, explicit active queries, terminal override, all-status mode, and `listChangeWorkflowIds` SDK query construction. Verified targeted Temporal list tests, related store-temporal tests, and bin CLI tests.

## Specs Modified


## Wisdom Accumulated

- **[pattern]** For worker-free Temporal Visibility status tables, combine ADV custom lifecycle search attributes with server-owned `ExecutionStatus = "Running"` to exclude completed workflows when custom status upserts are best-effort or stale.
- **[gotcha]** When adding `ExecutionStatus = "Running"` to shared Temporal Visibility enumeration, preserve `statuses: null` all-status mode and terminal-status overrides; archive/audit callers need completed/archived executions visible.
