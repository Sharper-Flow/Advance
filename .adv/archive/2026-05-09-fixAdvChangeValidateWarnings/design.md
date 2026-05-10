# Design

## Implementation Plan

1. Locate `adv_change_validate` tool schema, result aggregation, and strict-mode call sites.
2. Add failing regression tests for:
   - `strict:true` with only warnings returns `passed:true` and includes warnings.
   - `strict:true` with errors returns `passed:false`.
   - `strict:true, strictWarnings:true` with warnings returns `passed:false`.
   - no-warning/no-error combinations remain passing.
3. Add `strictWarnings?: boolean` to the tool argument schema and pass/fail calculation.
4. Preserve structured output fields for warnings/errors so existing consumers can continue rendering advisory findings.
5. Run focused validator/tool tests, then `pnpm run check` from `plugin/`.

## Contracts

- `passed:false` means at least one blocking finding exists, or warning escalation was explicitly requested.
- Warnings remain visible in output even when `passed:true`.
- Default strict mode does not convert warnings into blocking failures.
- Explicit `strictWarnings:true` is opt-in and machine-checkable.

## Test Strategy

- Red phase: add focused failing tests before implementation.
- Green phase: implement aggregation/schema changes.
- Verify with focused test file(s), then plugin check.

## Rollback

Revert schema and aggregation changes if callers depend on current behavior and cannot migrate. In that case, document strict-mode warning escalation as a spec decision and update issue #63 accordingly instead of silently preserving ambiguity.