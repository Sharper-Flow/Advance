# Discovery Agreement

## Facts

- Issue #91 reports age-only blank assistant row classification risks deleting rows from live OpenCode sessions.
- Doctor script `--apply` is deletion-capable; classification must fail closed.
- Existing backup-before-apply safety must remain.

## Decisions

- Replace age-only deletion eligibility with explicit buckets: `live_in_flight`, `idle_active_session`, `orphan_ghost`.
- Delete only `orphan_ghost` rows.
- Unknown or active liveness evidence must skip deletion and be reported, not repaired.

## Risks / Unknowns

- Session DB/process metadata may be incomplete across platforms.
- Liveness checks must be injectable for deterministic tests.

## Out of Scope

- Upstream OpenCode DB schema changes.
- Removing backup-before-apply behavior.