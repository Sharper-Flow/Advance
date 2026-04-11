---
name: adv-validate
description: Validate change compliance against specs; block archive on failure
args:
  - name: change_id
    description: Change ID to validate
    required: false
  - name: strict
    description: Enable strict validation (warnings become errors)
    required: false
---
# ADV Validate — Check Change Against Specs
Validate change proposal against deployed specs via `adv_change_validate`.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
Parse `$ARGUMENTS`: `change-id`, `--strict`.
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---
## Phase 1: Run Validation
`adv_change_validate changeId: <target> strict: {true if --strict}`

Returns: `valid` (bool), `errors[]`, `warnings[]`, `info[]`.

---
## Phase 2: Display Results
If valid → VALIDATION PASSED banner: change-id, mode, warnings (if any), info.

If invalid → VALIDATION FAILED banner: change-id, mode, numbered errors (code, message, location, fix suggestion), warnings.

---
## Phase 3: Error Guidance
| Error Code | Fix |
|------------|-----|
| DUPLICATE_REQUIREMENT_ID | Use unique ID: `rq-{nanoid()}` |
| ORPHANED_DELTA_TARGET | Create target, remove delta, or fix ID |
| SPEC_NOT_FOUND | Create spec or use 'add' delta type |
| INVALID_ID_FORMAT | Use: `rq-{nanoid}`, `rq-{parent}.{n}`, `tk-{nanoid}`, `dl-{nanoid}` |
| NO_TASKS (warning) | Add tasks via `/adv-prep` or `adv_task_add` |
| NO_DELTAS (warning) | Define spec deltas in change.json |

---
## Strict Mode
Warnings promoted to errors. Use before `/adv-apply` and `/adv-archive`.
```
/adv-validate {change-id} COMPLETE
Result: {PASSED | FAILED} ({errors} errors, {warnings} warnings)
Next: /adv-prep {change-id}
```
## Key Tool
| Purpose | Tool |
|---------|------|
| Validate | `adv_change_validate changeId: <id> strict: <bool>` |
