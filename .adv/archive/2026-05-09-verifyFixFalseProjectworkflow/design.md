# Design

## Implementation / Verification Plan

1. Capture current live `adv_temporal_diagnose`/`adv_status` evidence for healthy project workflow behavior.
2. Inspect diagnose lookup path and existing tests for false `projectWorkflow NOT_FOUND` coverage.
3. If false NOT_FOUND is not reproducible and coverage is adequate, document verification and prepare acceptance.
4. If coverage is missing or failure reproduces, add focused regression and fix lookup/retry/staleness handling.
5. Run focused Temporal diagnose/status tests and plugin check as needed.

## Planned Tasks

1. Verify current live diagnose/status behavior and inspect source/test coverage for false projectWorkflow NOT_FOUND path.
2. Add regression/fix only if false NOT_FOUND path remains uncovered or reproducible.
3. Run focused diagnose/status verification and plugin check; document closure or remaining failure evidence.

## Contracts

- Healthy Temporal/project workflow is not reported as `projectWorkflow NOT_FOUND`.
- Truly missing workflow still returns actionable diagnostics.
- Verification-first issues may close with evidence and no code churn.

## Test Strategy

- Live tool evidence for current session.
- Focused source tests if behavior is not already covered.
- `pnpm run check` from `plugin/` before claiming fixed if code changes occur.