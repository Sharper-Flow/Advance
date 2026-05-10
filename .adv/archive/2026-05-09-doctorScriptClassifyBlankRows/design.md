# Design

## Plan

1. Add regression tests with synthetic rows for live, idle-active, and orphan-ghost buckets.
2. Add liveness abstraction/injection so tests can prove bucket behavior deterministically.
3. Update doctor dry-run reporting to show bucket counts and samples.
4. Update apply path to delete only orphan ghosts.
5. Run focused doctor/session-debt tests and repo check.

## Contracts

- Deletion requires `orphan_ghost` classification.
- Unknown liveness fails closed.
- Backup-before-apply remains mandatory.

## Test Strategy

- RED one-row-per-bucket tests.
- Apply test proving only orphan row deletion.
- Focused tests plus `pnpm run check`.