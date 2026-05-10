# Fix adv_change_validate warnings-only strict-mode result

## Intent

Resolve bug #63: `adv_change_validate` should not return `passed:false` for warnings-only validation results in strict mode unless strict-mode contract explicitly says warnings fail.

## Scope

- Inspect validation result aggregation and strict-mode semantics.
- Add a failing test for warnings-only validation output.
- Fix passed/error/warning classification so strict mode only fails on intended severities.
- Update docs/spec wording if existing contract is ambiguous.

## Success Criteria

- Warnings-only validation returns `passed:true` or an explicitly documented strict-mode warning policy.
- Errors still fail validation.
- Regression tests cover warnings-only and error states.
- Relevant checks pass.