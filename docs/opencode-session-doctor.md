# OpenCode Session Doctor and Worktree Cleanup

ADV reports stale OpenCode blank assistant messages in `adv_status` as a `[doctor]` recommendation.

## Dry Run

```bash
bun scripts/opencode-session-doctor.ts --dry-run
```

Optional flags:

```bash
bun scripts/opencode-session-doctor.ts --dry-run --db ~/.local/share/opencode/opencode.db --threshold-ms 300000
```

Dry-run opens the DB read-only. If the DB is missing or inaccessible, the command reports `available:false` and exits without deletion. Output includes:

- `repairable_stale` — assistant rows with `finish=null`, zero parts, and age at/above threshold
- `live_in_flight` — same shape but younger than threshold; never repairable

## Apply

```bash
bun scripts/opencode-session-doctor.ts --apply --backup-dir /tmp/opencode/session-doctor-backup
```

Apply refuses to run without `--backup-dir`. It backs up `opencode.db`, `opencode.db-wal`, and `opencode.db-shm` before deleting repairable rows.

## Worktree Cleanup

The installed `kdco/worktree` plugin in `~/.config/opencode/plugin/` now queues pending deletes in `pending_deletes` and exposes:

```text
worktree_cleanup
```

Use it after closing shells/processes that had a worktree as CWD.

This is an installed-artifact patch. If `kdco/worktree` is reinstalled or synced from registry, promote the patch to that source or reapply it.
