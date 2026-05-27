# Problem Statement

Worktree cleanup could hang after a git worktree was already removed because post-delete workflow/cache notification was awaited without a local bound. Queued pending-delete cleanup also processed items serially without a per-item bound, so one stuck deletion could block later queued cleanup work.

This was risky because retrying after an ambiguous hang could be unsafe: the authoritative git removal may already have succeeded while ADV state or notifications remained stale.
