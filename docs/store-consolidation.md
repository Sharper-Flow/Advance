# Store Consolidation (`adv_store_consolidate`)

Recovery tool for **orphaned ADV identity stores** — external state
directories minted under a shallow-boundary or graft pseudo-root SHA before
the shallow-repo identity guard shipped (`UnstableIdentityError`; see
[SETUP.md § Shallow Clones](../SETUP.md#shallow-clones-refuse-adv-state-unstableidentityerror)).

Each ADV project keeps its mutable state in an external store keyed by the
repo's root commit:

```
$XDG_DATA_HOME/opencode/plugins/advance/{projectId}/
# or, under per-project OpenCode shards:
$XDG_DATA_HOME/opencode-projects/{shard}/opencode/plugins/advance/{projectId}/
```

When a shallow clone's fetch boundary moves, a new "project" appears and the
old store is orphaned. `adv_store_consolidate` merges the orphan store into
the true-root store with zero silent data loss.

## Flow: scan → dry_run → approve → execute

### 1. Scan (read-only)

```json
{ "action": "scan" }
```

Enumerates candidate orphan stores for the current repo across both XDG shard
layouts and flags directories minted under unstable SHAs using structural git
checks only. No mutations.

### 2. Dry run (read-only)

```json
{ "action": "dry_run", "source_project_id": "<40-hex orphan SHA>" }
```

`target_project_id` defaults to the current repo's resolved true-root
identity. Emits the full per-item plan:

- Changes partitioned **live vs terminal**
- Archive bundles, Epics (including retired Epics)
- Wisdom / reflections row counts
- Per-item plan action: `recreate`, `import_projection`, `append_dedupe`,
  `skip_collision`, or `skip_ledgered`
- Per-ID **collision report**

Zero mutations. Review this plan before executing.

### 3. Approve

Execution requires explicit user approval: `approvedByUser: true` plus
non-blank `approvalEvidence`. Without them, the tool refuses with
`ConsolidationError` code **`approval_required`**.

### 4. Execute (approval-gated)

```json
{
  "action": "execute",
  "source_project_id": "<40-hex orphan SHA>",
  "approvedByUser": true,
  "approvalEvidence": "<user approval quote or reference>"
}
```

Execution applies the exact dry-run plan, terminal-first:

1. **Terminal items** (archived/closed changes, archived Epics) import as
   disk projections — visible via `includeArchived: true`.
2. **Live items** (active changes and Epics) are recreated under the true
   identity as **new Temporal workflows carrying prior state** (tasks, gates,
   artifacts, Epic membership). Histories are never rewritten.
3. **Wisdom and reflections** rows append with content-hash dedupe.
4. An append-only **ledger** (`consolidation-ledger.jsonl` in the target
   store) records every applied item, keyed on
   `(sourceProjectId, targetProjectId, itemId)`.

## Refusals (typed, zero mutations)

All refusals are `ConsolidationError` with a machine-readable `error_code`:

| Code | Cause | Remediation |
|---|---|---|
| `approval_required` | Missing `approvedByUser: true` or blank approval evidence | Obtain explicit user approval and re-run execute |
| `worker_lock_live` | A live Temporal worker holds the source store's `worker.lock` | Stop the worker against the orphan store first |
| `collisions_present` | One or more item IDs exist in both stores | Inspect the per-ID collision report; resolve duplicates manually (no newest-wins auto-resolution) |

## Idempotency

Re-running consolidation after success is a **no-op**: ledgered items plan as
`skip_ledgered` and are neither re-imported nor recreated. The run reports
itself as a no-op. The ledger is append-only and is the structural idempotency
key — do not hand-edit it.

## Orphan-store retention

Consolidation **never modifies or deletes the source store**. The orphan
store stays on disk as a forensic copy; deleting it requires a separate
explicit approval outside the consolidation flow.

## Verification after consolidation

```text
adv_change_list includeArchived: true   # terminal items reappear
adv_epic_list status: "all"             # Epics (incl. retired) reappear
```

Compare before/after counts from the dry-run plan against the execute report
to confirm full migration.
