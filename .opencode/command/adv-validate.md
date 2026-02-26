---
name: adv-validate
description: Validate change compliance against specs; block archive on failure
agent: build
args:
  - name: change_id
    description: Change ID to validate (or --all for project-wide)
    required: false
  - name: strict
    description: Enable strict validation (warnings become errors)
    required: false
---

# ADV Validate — Check Change Against Specs

Validate a change proposal against deployed specs. Uses `adv_change_validate` tool for all validation logic.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Parse `$ARGUMENTS` for:
- `change-id`: The change to validate
- `--strict` or `strict`: Enable strict mode
- `--all`: Validate entire project (future feature)

1. **If change-id provided**: Use directly
2. **If empty**: Call `adv_change_list`, select via the `question` tool
3. **If --all**: Run project-wide validation (if supported)

---

## Phase 1: Run Validation

### Execute Validation Tool

```
adv_change_validate changeId: <target> strict: {true if --strict else false}
```

The tool returns:
```json
{
  "valid": true|false,
  "errors": [...],
  "warnings": [...],
  "info": [...]
}
```

---

## Phase 2: Display Results

### If Valid (No Errors)

```
============================================================
              VALIDATION PASSED
============================================================

Change: {change-id}
Mode: {strict ? "strict" : "normal"}

RESULT: VALID

{if warnings.length > 0}
WARNINGS ({warnings.length}):
{for each warning}
- [{warning.code}] {warning.message}
  {if warning.location}at {warning.location}{end}
{end}
{end}

{if info.length > 0}
INFO ({info.length}):
{for each info}
- {info.message}
{end}
{end}

============================================================

Ready for implementation: /adv-apply {change-id}
```

### If Invalid (Has Errors)

```
============================================================
              VALIDATION FAILED
============================================================

Change: {change-id}
Mode: {strict ? "strict" : "normal"}

RESULT: INVALID

ERRORS ({errors.length}):
{for each error}
{n}. [{error.code}] {error.message}
   {if error.location}Location: {error.location}{end}
   {if error.suggestion}Fix: {error.suggestion}{end}
{end}

{if warnings.length > 0}
WARNINGS ({warnings.length}):
{for each warning}
- [{warning.code}] {warning.message}
{end}
{end}

============================================================

Fix errors before proceeding.
```

---

## Phase 3: Error Guidance

For common errors, provide specific guidance:

### DUPLICATE_REQUIREMENT_ID
```
Error: Requirement ID '{id}' already exists in specs/{capability}

Fix: Use a unique ID. Generate new one:
  rq-{nanoid()}
```

### ORPHANED_DELTA_TARGET
```
Error: Delta targets '{id}' which doesn't exist

Fix: Either:
1. Create the target requirement first (add delta)
2. Remove this delta
3. Fix the target ID
```

### SPEC_NOT_FOUND
```
Error: Capability '{name}' not found in deployed specs

Fix: Either:
1. Create the spec first: specs/{name}/spec.json
2. This is a new capability - use 'add' delta type
```

### INVALID_ID_FORMAT
```
Error: ID '{id}' doesn't match expected format

Expected formats:
- Requirement: rq-{nanoid}
- Scenario: rq-{parent}.{n}
- Task: tk-{nanoid}
- Delta: dl-{nanoid}
```

### NO_TASKS (Warning)
```
Warning: No tasks defined for change

Suggestion: Add tasks with /adv-prep or:
  adv_task_add changeId: {id} content: "..."
```

### NO_DELTAS (Warning)
```
Warning: No spec deltas defined

Suggestion: Define what specs this change modifies.
Add deltas to changes/{id}/change.json
```

---

## Phase 4: Completion

### Completion Banner

```
============================================================
      /adv-validate {change-id} COMPLETE
============================================================
Result: {valid ? "PASSED" : "FAILED"} ({error_count} errors, {warning_count} warnings)

  ⚡ Recommended next step (Plan agent):
     /adv-prep {change-id}
============================================================
```

---

## Strict Mode

In strict mode (`--strict`):
- Warnings are promoted to errors
- All issues must be resolved before proceeding

Use strict mode before:
- `/adv-apply` (implementation)
- `/adv-archive` (finalization)

---

## Key Tool

| Purpose | Tool |
|---------|------|
| Validate | `adv_change_validate changeId: <id> strict: <bool>` |

All validation logic is in the tool. This command formats output and provides guidance.
