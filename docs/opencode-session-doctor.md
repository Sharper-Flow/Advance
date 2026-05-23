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

- `orphan_ghost` — assistant rows with `finish=null`, zero parts, and no recent session activity at/above threshold; these are the only deletable rows
- `idle_active_session` — stale blank rows that are not proven orphaned; never deleted automatically
- `live_in_flight` — same shape but younger than threshold or attached to a recently updated session; never repairable
- `repairable_stale` — deprecated compatibility alias for `orphan_ghost`

## Apply

```bash
bun scripts/opencode-session-doctor.ts --apply --backup-dir /tmp/opencode/session-doctor-backup
```

Apply refuses to run without `--backup-dir`. It backs up `opencode.db`, `opencode.db-wal`, and `opencode.db-shm` before deleting `orphan_ghost` rows.

## Worktree Cleanup

Use ADV-native `adv_worktree_cleanup` after closing shells/processes that had a worktree as CWD. The tool retries queued deletes and skips worktrees still used by a live process.
