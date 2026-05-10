# Design

## Implementation Plan

1. Locate `MISSING_TDD_EVIDENCE` generation and task classification inputs.
2. Add failing regression cases for data-only/constant-only tasks being exempt and behavior/code tasks remaining enforced.
3. Adjust classification or validation gate to require TDD evidence only when task intent/type is applicable.
4. Preserve structured warning/error output for real missing evidence.
5. Run focused validator tests and plugin check.

## Planned Tasks

1. Add failing regression tests for data/constant tasks not triggering `MISSING_TDD_EVIDENCE` and behavior tasks still requiring evidence.
2. Implement structural validation/classification fix so TDD evidence applies only to TDD-applicable tasks.
3. Run focused validator tests and plugin check; document verification evidence and live-session rebuild caveat if needed.

## Contracts

- Data/constant-only tasks do not receive inappropriate `MISSING_TDD_EVIDENCE` findings.
- Behavior-changing code tasks still require TDD evidence.
- Exemption must be structural: task metadata/classification, not freeform title guess alone.

## Test Strategy

- Red tests for data/constant false positives.
- Regression tests for normal behavior tasks still failing without evidence.
- Focused validation tests, then `pnpm run check` from `plugin/`.