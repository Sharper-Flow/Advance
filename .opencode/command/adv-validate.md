---
name: adv-validate
description: Validate a change against existing specs (specs as laws)
args:
  - name: change_id
    description: The change ID to validate
    required: true
  - name: strict
    description: Treat warnings as errors
    required: false
---

# /adv-validate - Validate Change Against Specs

Validate a change proposal against existing specs to ensure it doesn't violate the "specs as laws" principle.

## Arguments

- `change_id` (required): The ID of the change to validate
- `strict` (optional): If "strict", treat warnings as errors

## Validation Checks

The validator performs two categories of checks:

### Completeness Checks (Warnings)
- `NO_TASKS`: Change has no tasks defined
- `NO_DELTAS`: Change has no spec deltas defined
- `MISSING_SCENARIO`: Added requirement has no scenarios
- `INCOMPLETE_SCENARIO`: Scenario missing given/when/then

### Conflict Checks (Errors)
- `DUPLICATE_REQUIREMENT_ID`: Requirement ID already exists in specs
- `ORPHANED_DELTA_TARGET`: Modify/remove targets non-existent requirement
- `SPEC_NOT_FOUND`: Modifying a capability that doesn't exist
- `INVALID_ID_FORMAT`: IDs don't match expected patterns

### Priority Checks (Warnings)
- `MODIFYING_MUST_TO_MAY`: Downgrading requirement priority
- `REMOVING_REFERENCED_REQUIREMENT`: Removing a requirement referenced by others

## Process

1. Call `adv_change_validate` with the change ID
2. Format and display results
3. If errors exist, suggest fixes
4. If only warnings, allow proceeding with acknowledgment

## Output Format

### Validation Passed
```
============================================================
                 VALIDATION PASSED
============================================================
Change: {change_id}
Checks: {checks_performed}
Errors: 0
Warnings: {warning_count}

{if warnings}
WARNINGS (non-blocking):
{for each warning}
- [{code}] {message}
  Path: {path}
{end}
{end}

Ready to proceed with /adv-apply {change_id}
============================================================
```

### Validation Failed
```
============================================================
                 VALIDATION FAILED
============================================================
Change: {change_id}
Checks: {checks_performed}
Errors: {error_count}

ERRORS (must fix):
{for each error}
- [{code}] {message}
  Path: {path}
  {if details}Details: {details}{end}
{end}

{if warnings}
WARNINGS:
{for each warning}
- [{code}] {message}
{end}
{end}

FIX SUGGESTIONS:
{for each error, suggest fix}
============================================================
```

## Fix Suggestions

| Error Code | Suggestion |
|------------|------------|
| `DUPLICATE_REQUIREMENT_ID` | Change the requirement ID to a unique value |
| `ORPHANED_DELTA_TARGET` | Verify the target requirement exists, or change to "add" operation |
| `SPEC_NOT_FOUND` | Create the spec first, or use "add" operations only |
| `INVALID_ID_FORMAT` | Use format: `rq-{nanoid}` for requirements, `dl-{nanoid}` for deltas |

## Example

```
User: /adv-validate add-rate-limiting-abc123

Agent: [calls adv_change_validate]

============================================================
                 VALIDATION PASSED
============================================================
Change: add-rate-limiting-abc123
Checks: completeness, conflicts
Errors: 0
Warnings: 1

WARNINGS (non-blocking):
- [MISSING_SCENARIO] Requirement rq-rate001 has no scenarios
  Path: deltas.api-capability.dl-rate001

Ready to proceed with /adv-apply add-rate-limiting-abc123
============================================================
```

## Strict Mode

When `strict` is specified, warnings are treated as errors:

```
User: /adv-validate add-rate-limiting-abc123 strict

Agent: [calls adv_change_validate with strict=true]
[Reports warnings as errors, validation fails]
```

## Notes

- Always validate before applying changes
- Fix all errors before proceeding
- Warnings indicate potential issues but don't block progress
- Use strict mode for production-critical changes
