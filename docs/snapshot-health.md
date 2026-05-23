# Snapshot Health Diagnostics

`adv_snapshot_health` detects and remediates OpenCode snapshot-store corruption — stale locks, zero-byte git objects, fsck errors, orphan bare repos, oversized dirs, and legacy-layout artifacts that historically caused recurring agent freezes (notably example-web index.lock contention).

The tool is **read-only by default**. Repairs require explicit user approval, are restricted to a closed whitelist, and write audit entries to the ADV agenda.

> **This does not fix the upstream OpenCode race.** That is OpenCode-core, tracked at Sharper-Flow/Advance#118 (open — discovery gate running in main checkout). `adv_snapshot_health` is defense-in-depth: detect degraded state, surface it, and provide a structured repair path.

## What It Detects

Seven patterns, three severity levels:

| Pattern | Severity | Trigger | Remediation |
|---|---|---|---|
| `stale_lock` | critical | `*.lock` file with mtime >5 min ago AND no `lsof` holder (or `lsof` unavailable) | `delete_stale_locks` |
| `zero_byte_object` | critical | File under `objects/{xx}/[0-9a-f]{38,}` with size 0 | `delete_zero_byte_objects` |
| `fsck_error` | critical | `git fsck --no-dangling --connectivity-only` reports error/fatal/missing/corrupt/broken (max 10 per repo; skipped on dirs >500 MB) | (none — manual investigation required) |
| `orphan_bare_repo` | warning | Bare repo exists but expected worktree path is missing | `delete_orphan_bare_repos` |
| `oversized_dir` | info | Bare repo dir >100 MB (advisory; not structural corruption) | (none) |
| `legacy_layout` | info | `{projectId}/` is itself a bare repo (HEAD+objects+refs at project root), rather than under `{worktreeHash}/` subdir | `delete_orphan_bare_repos` |
| `no_snapshot_dirs` | info | Project external state dir exists but no snapshot bare repos found | (none) |

## How To Invoke

### Scan (read-only)

```
adv_snapshot_health()
adv_snapshot_health({ scope: "global" })  // scan all OpenCode projects
```

Default `scope` is `"project"` (caller-project only). `scope: "global"` reads directory metadata only (no object content reads).

### Repair (approval-gated)

```
adv_snapshot_health({
  action: "repair",
  approvedByUser: true,
  approvalEvidence: "User approved cleanup of 3 stale locks after review",
  repair_actions: ["delete_stale_locks", "delete_zero_byte_objects"],
})
```

Required for `action: "repair"`:
- `approvedByUser: true`
- `approvalEvidence`: non-empty human-readable string
- `repair_actions`: non-empty array drawn from `["delete_stale_locks", "delete_zero_byte_objects", "delete_orphan_bare_repos"]`

Tool rejects the call if any required field is missing.

### DryRun

```
adv_snapshot_health({
  action: "repair",
  dryRun: true,
  approvedByUser: true,
  approvalEvidence: "Preview before approving",
  repair_actions: ["delete_stale_locks"],
})
```

Returns `repair_preview` with `status: "success"` records and no filesystem mutations.

## Repair Safety Model

1. **Closed whitelist** — only three repair actions are accepted. Unknown strings rejected at the Zod schema layer.
2. **Approval gate** — every repair call requires `approvedByUser: true` + non-empty `approvalEvidence`.
3. **TOCTOU race guard** — before deleting a stale lock, the repair flow re-checks `lsof` and refuses if a holder PID has reappeared since the scan. Before deleting an orphan bare repo, it re-resolves the worktree path and refuses if it has reappeared.
4. **No history-altering ops** — `git gc`, `git prune`, `git filter-repo` are explicitly out of scope (constraint C3 from the change agreement).
5. **Audit trail** — every successful repair appends an entry to the ADV agenda with `category: "snapshot-repair"`, `priority: "low"`, and a human-readable description containing the finding pattern, target path, and result.

## adv_status Integration

The tool is also called automatically (TTL-cached, 60s) by `adv_status`. Summary line appears in `view: health`:

- `Snapshot: ok clean`
- `Snapshot: ok clean (N info)` when only advisory findings
- `Snapshot: warning N warning(s)` when warnings present
- `Snapshot: critical N critical` when critical findings present

Full finding table (raw `snapshot_health` field) is available in both `view: health` and `view: hygiene`.

## Output Schema

Stable `schema_version: 1`. Consumers should check `schema_version >= N` for forward compatibility.

```typescript
{
  schema_version: 1,
  scan_duration_ms: number,
  scope: "project" | "global",
  project_id: string,
  summary: {
    projects_scanned: number,
    bare_repos_scanned: number,
    critical: number,
    warnings: number,
    info: number,
  },
  findings: SnapshotFinding[],
  repair_preview?: {
    actions_planned: number,
    actions_executed: number,
    details: RepairActionRecord[],
  },
}
```

See `plugin/src/tools/snapshot-scan.ts` for full type definitions.

## Constants

| Constant | Value | Purpose |
|---|---|---|
| `STALE_LOCK_THRESHOLD_MS` | 5 min | Lock files older than this with no holder are flagged |
| `OVERSIZED_THRESHOLD_BYTES` | 100 MB | Info-severity threshold for oversized bare repos |
| `FSCK_SKIP_THRESHOLD_BYTES` | 500 MB | fsck is skipped on bare repos larger than this (performance) |
| `MAX_FSCK_ERRORS_PER_REPO` | 10 | Cap on fsck error lines captured per repo |

## Known Limitations

- **Upstream race not fixed.** The OpenCode snapshot-service race on `index.lock` (cross-process) remains. This tool is detection + cleanup, not prevention.
- **`lsof` required for stale-lock detection.** When `lsof` is missing, the tool degrades to `holder_pid: "unknown_no_lsof"` and still flags stale locks (defensive default — assume no holder).
- **No automatic remediation of `fsck_error`.** These typically indicate non-trivial corruption; the tool surfaces the error lines but does not delete or repair. Manual `git fsck` investigation recommended.
- **Cross-project repair requires per-call approval.** Cross-project READ (scope: global) is allowed without confirmation; cross-project REPAIR must be explicit via the same approval gate.

## Requirements Cited

This tool implements:
- `rq-snapshotHealthProbe01` — detection pattern coverage
- `rq-snapshotHealthSafeDefault01` — read-only default
- `rq-snapshotHealthRepairWhitelist01` — closed repair whitelist
- `rq-snapshotHealthAuditTrail01` — repair audit trail
- `rq-snapshotHealthScopeBoundary01` — scope boundary
- `rq-snapshotHealthSchemaVersion01` — output schema versioning
- `rq-snapshotHealthLayoutDetect01` — modern + legacy layout support
- `rq-snapshotHealthRaceGuard01` — repair race guard (TOCTOU)

See `.adv/specs/snapshot-health/spec.json` for full requirement bodies and acceptance scenarios.
