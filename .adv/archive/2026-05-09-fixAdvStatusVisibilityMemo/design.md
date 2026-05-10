# Design

## Implementation Plan

1. Locate `adv_status` visibility memo/cache and mutation paths for deleted/archived/closed changes.
2. Add failing regression coverage for same-session status no longer showing removed/stale change entries.
3. Implement scoped invalidation on relevant mutation paths or make status reconcile terminal/deleted visibility before rendering.
4. Preserve performance characteristics with targeted invalidation where possible.
5. Run focused status/cache tests and plugin check.

## Planned Tasks

1. Add failing regression coverage for same-session adv_status after change deletion/removal or terminal visibility invalidation.
2. Implement scoped visibility memo invalidation/reconciliation for deleted/archived/closed change entries.
3. Run focused status/cache tests and plugin check; document verification evidence.

## Contracts

- `adv_status` does not show deleted/stale change entries after mutation in same session.
- Cache invalidation stays scoped and deterministic.
- Status remains tolerant of Temporal visibility delays where applicable.

## Test Strategy

- Red test for stale entry after mutation.
- Regression test that normal status still lists active changes.
- Focused status tests, then `pnpm run check` from `plugin/`.