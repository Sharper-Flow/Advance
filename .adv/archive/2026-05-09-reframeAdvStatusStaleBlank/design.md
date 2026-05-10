# Design

## Plan

1. Add failing status formatting test for misleading stale/deletable wording.
2. Update status/session-debt formatter to use neutral active-session/orphan wording.
3. Preserve or adapt when #91 classification fields are available.
4. Run focused status tests and repo check.

## Contracts

- Status must not imply live rows are safe to delete.
- Deletion-capable guidance remains approval-gated/dry-run-first.
- Output remains actionable.

## Test Strategy

- RED status-output wording regression.
- GREEN formatter update.
- Focused status tests plus `pnpm run check`.