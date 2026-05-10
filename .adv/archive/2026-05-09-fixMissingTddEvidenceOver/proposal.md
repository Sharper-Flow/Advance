# Fix MISSING_TDD_EVIDENCE over-triggering on data and constant tasks

## Intent

Resolve bug #62: `adv_change_validate` should not over-trigger `MISSING_TDD_EVIDENCE` on tasks whose implementation is data/constant-only or otherwise not TDD-applicable.

## Scope

- Inspect task classification and validation logic for TDD evidence warnings/errors.
- Add regression tests for data-only/constant-only tasks and normal code tasks.
- Fix classification or validation gates so TDD evidence is required only for applicable task intents.
- Preserve strict enforcement for real code behavior changes.

## Success Criteria

- Data/constant tasks no longer get inappropriate `MISSING_TDD_EVIDENCE` findings.
- Code behavior tasks still require TDD evidence as contracted.
- Regression tests cover both exempt and non-exempt cases.
- Relevant checks pass.