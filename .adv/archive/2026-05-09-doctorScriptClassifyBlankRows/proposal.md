# Doctor script: classify blank rows by orphan-vs-live

## Intent

Resolve bug #91: `scripts/opencode-session-doctor.ts --apply` must not delete blank assistant rows that belong to still-live OpenCode sessions merely because the rows are older than the stale threshold.

## Scope

- Replace age-only blank-row repair classification with three explicit buckets: `live_in_flight`, `idle_active_session`, and `orphan_ghost`.
- Use session/process liveness evidence where available before allowing deletion.
- Update `--dry-run` reporting and `--apply` behavior so only orphan ghosts are deleted.
- Add regression coverage with synthetic database rows for each bucket.
- Preserve existing backup-before-apply safety behavior.

## Success Criteria

- `--dry-run` reports all three bucket counts and representative samples.
- `--apply` deletes only rows classified as orphan ghosts.
- Blank rows owned by live OpenCode sessions are skipped and reported as active-session debt, not repairable stale ghosts.
- Regression tests prove one-row-per-bucket behavior.
- Relevant checks pass.