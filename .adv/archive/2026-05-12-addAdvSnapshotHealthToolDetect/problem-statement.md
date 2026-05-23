## Problem

OpenCode's snapshot service maintains a per-`{projectID, worktreePath-hash}` git bare repo to record between-turn project state. It is keyed on project ID + worktree path and uses git's own `index.lock` for serialization. Single-process operations are semaphore-serialized per gitdir, but **cross-process operations are unprotected** — when multiple opencode sessions touch the same gitdir (e.g. two sessions running in the same checkout, or a session plus a cleanup loop in another session targeting the same worktree), they race on `index.lock` and one fails with `exitCode=128`. The losing op drops its snapshot, surfacing as a blank assistant message and what users perceive as "agent crash" or "agent freeze".

Worse, a racing crash can leave behind:

- **Stale `index.lock`** files (zero-byte, no holder process) which permanently block all future snapshot ops for that gitdir until manually removed.
- **Zero-byte git objects** under `objects/` when `git add` is interrupted mid-write. These get referenced by history and every subsequent snapshot op walks them, hitting `object corrupt or missing` and re-failing. Self-reinforcing.

Tracked upstream as [Sharper-Flow/Advance#1](https://github.com/Sharper-Flow/Advance/issues/1) (closed) and [Sharper-Flow/Advance#118](https://github.com/Sharper-Flow/Advance/issues/118) (open). The race is below ADV's layer — ADV state is Temporal-serialized, per-worktree git is filesystem-isolated, but OpenCode's snapshot subsystem races. The upstream fix is in OpenCode-core, not ADV.

ADV today has no way to **detect** that the snapshot store is degraded. The forensic pattern (find stale locks via `find`, scan zero-byte objects, run `git fsck` on each bare repo) has been executed manually in at least four diagnosis sessions for pokeedge-web alone (2026-05-04, 2026-05-10, 2026-05-11, 2026-05-12). Every recurrence requires re-investigation from scratch.

## Why this matters

Without detection, the failure mode is silent: users see "agent froze" with no diagnostic trail. The remediation (lock removal + zero-byte object delete + git fsck rebuild) is well-understood but currently requires manually constructed shell scripts and per-incident triage. A probe that runs as part of `adv_status` (or on demand) would turn a recurring multi-hour incident into a single visible warning the agent can present and remediate with user approval.

## Scope

A new read-only ADV tool `adv_snapshot_health` that scans `$XDG_DATA_HOME/opencode/snapshot/` for the calling project (or all projects) and reports:

- Stale `index.lock` files (>5min mtime, no `lsof` holder)
- Zero-byte git object files under `objects/{xx}/{...}`
- `git fsck --connectivity-only` errors per bare repo
- Bare repos whose project worktree path no longer exists (orphans)
- Oversized snapshot dirs (>100MB, advisory)
- Cleanup-loop lag (last-mtime vs expected hourly cadence)

A separate repair action gated by `approvedByUser: true` and a finding-specific whitelist may remove stale locks, delete zero-byte objects (forcing git to rebuild), and remove orphan bare repos. Repairs are logged to the ADV agenda for auditability.

Findings are surfaced automatically by `adv_status view: health` (summary line) and `adv_status view: hygiene` (full table).