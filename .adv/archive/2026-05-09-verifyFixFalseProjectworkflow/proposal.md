# Verify or fix false projectWorkflow NOT_FOUND diagnosis

## Intent

Resolve bug #67: `adv_temporal_diagnose` should not report false `projectWorkflow NOT_FOUND` when the project workflow is healthy.

## Scope

- Reproduce or verify the suspected false-negative diagnostic path.
- Compare diagnose workflow lookup with status/worker health mechanisms.
- Fix lookup/retry/staleness handling if false NOT_FOUND can still occur.
- Add regression coverage or documented verification evidence.

## Success Criteria

- Healthy project workflow is not reported as NOT_FOUND.
- Real missing workflow still returns actionable diagnostics.
- Regression tests or verification evidence cover both paths.
- Relevant checks pass.