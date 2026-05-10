# Design

## Implementation / Verification Plan

1. Capture current live `adv_status` and `adv_temporal_diagnose` evidence for alive/serviceable worker.
2. Inspect worker health/diagnose logic and tests for stale PID/lock/queue-serviceability false-negative coverage.
3. If behavior is healthy and covered, document verification and prepare acceptance without code churn.
4. If false-negative path is uncovered or reproducible, add failing regression and fix classification/staleness handling.
5. Run focused health/diagnose tests and plugin check if code changes occur.

## Planned Tasks

1. Verify current live worker health/diagnose behavior and inspect source/test coverage for alive-but-reported-dead false negatives.
2. Add regression/fix only if stale PID/lock/queue-serviceability false-negative path remains uncovered or reproducible.
3. Run focused health/diagnose verification and plugin check; document closure or remaining failure evidence.

## Contracts

- Healthy connected worker is reported alive/serviceable consistently.
- Truly dead/wedged worker still yields actionable diagnostics.
- Verify-first issue may close with evidence and no code churn.

## Test Strategy

- Live tool evidence for current session.
- Focused unit tests for stale/healthy health states if needed.
- `pnpm run check` from `plugin/` before claiming fixed if code changes occur.