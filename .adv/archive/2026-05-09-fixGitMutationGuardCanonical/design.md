# Design

## Plan

1. Add failing regression coverage for canonical archive mutation allowed on default branch.
2. Add/keep regression coverage for unrelated default-branch git mutation blocked.
3. Implement narrow archive-operation allow path with explicit audit marker/operation classification.
4. Run focused guard/archive tests and repo check.

## Contracts

- Only intended ADV archive operation may bypass default-branch mutation guard.
- All unrelated default-branch mutations remain blocked.
- Guard decision must be deterministic and visible in tests.

## Test Strategy

- RED allow-path test for canonical archive push/update.
- RED/GREEN deny-path test for unrelated mutation.
- Focused guard tests plus `pnpm run check`.