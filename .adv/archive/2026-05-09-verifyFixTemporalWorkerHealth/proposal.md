# Verify or fix Temporal worker health false-negative diagnostics

## Intent

Resolve bug #33: Temporal worker health checks should not report false negatives when worker is alive, connected, and serviceable.

## Scope

- Reproduce or verify the reported mismatch between worker process liveness and diagnose health output.
- Compare health-check mechanisms used by `adv_status`, `adv_temporal_diagnose`, and worker restart logic.
- Fix stale PID/lock/queue-serviceability detection if false negatives still occur.
- Add regression coverage or verification evidence for alive-but-reported-dead scenarios.

## Success Criteria

- Healthy connected worker is reported as alive/serviceable consistently.
- Truly dead/wedged worker still surfaces actionable diagnostics.
- Regression tests or documented verification cover both healthy and false-negative paths.
- Relevant checks pass.