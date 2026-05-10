# Design

## Implementation Plan

1. Locate `adv_status` bootstrap and scoped ADV instruction-load readiness boundaries.
2. Add deterministic regression coverage or test seam for first-call status under pending/late instruction load.
3. Implement readiness ordering/retry/fallback that removes nondeterminism without hiding real failures.
4. Verify normal first-call status remains fast and healthy.
5. Run focused status/bootstrap tests and plugin check.

## Planned Tasks

1. Add failing deterministic regression coverage for first-call adv_status bootstrap race against scoped ADV instruction loading.
2. Implement deterministic readiness ordering/retry/fallback for first-call status bootstrap.
3. Run focused status/bootstrap tests and plugin check; document verification evidence.

## Contracts

- First `adv_status` call is deterministic under normal startup.
- Real bootstrap failures remain visible and actionable.
- Scoped ADV instruction loading remains enabled.

## Test Strategy

- Red test using mocked readiness/timing seam, not sleeps.
- Regression for healthy first-call status.
- Focused status tests, then `pnpm run check` from `plugin/`.