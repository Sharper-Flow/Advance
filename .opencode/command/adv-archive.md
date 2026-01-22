---
name: adv-archive
description: Archive completed change - apply deltas to specs, generate docs, move to archive
agent: build
---

# ADV Archive - Finalize Completed Change

Archive a completed change by applying deltas to deployed specs. All state managed by `adv_change_archive` tool.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Parse `$ARGUMENTS` for:
- `change-id`: Required
- `--dry-run` or `dry-run`: Optional flag

1. **If $ARGUMENTS provided**: Extract change-id (and dry-run flag if present)
2. **If empty**: Call `adv_change_list`, select via `mcp_question`

---

## Phase 1: Pre-Archive Checks

### Fetch Change Data

```
adv_change_show change_id: <target>
```

Verify `status` is "active".

### Verify Tasks Complete

```
adv_task_list change_id: <target>
```

**If any task not "done":**
```
============================================================
            ARCHIVE BLOCKED - INCOMPLETE TASKS
============================================================

Incomplete tasks:
{for each task where status != "done"}
- [ ] {task.id}: {task.title} ({task.status})
{end}

Complete tasks first: /adv-apply {change-id}
============================================================
```
Stop execution.

### Run Validation

```
adv_change_validate change_id: <target> strict: true
```

**If validation fails:** Show errors, stop execution.

---

## Phase 2: Archive Preview

Display what will happen:

```
============================================================
                   ARCHIVE PREVIEW
============================================================

Change: {change-id}
Title: {change.title}
Tasks: {total} complete

ACTIONS:
1. Apply {delta_count} deltas to specs
   {for each affected capability}
   - {capability}: {delta_count} deltas
   {end}

2. Update deployed specs
   {for each capability}
   - specs/{capability}/spec.json
   {end}

3. Generate documentation
   {for each capability}
   - docs/specs/{capability}.md
   {end}

4. Create archive record
   - archive/{date}-{change-id}/

============================================================
```

---

## Phase 3: Dry Run Check

**If --dry-run flag:**

```
============================================================
                  DRY RUN COMPLETE
============================================================

No changes made. To archive:
  /adv-archive {change-id}
============================================================
```
Stop execution.

---

## Phase 4: Confirmation

Use `mcp_question`:
```
header: "Confirm Archive"
question: "Archive '{change-id}'? This updates deployed specs."
options:
  - label: "Archive (Recommended)"
    description: "Apply deltas and archive"
  - label: "Dry run first"
    description: "Preview without changes"
  - label: "Cancel"
```

**If "Dry run"**: Re-run with dry-run flag.
**If "Cancel"**: Stop execution.

---

## Phase 5: Execute Archive

```
adv_change_archive change_id: <target>
```

The tool handles:
1. Applying deltas to `specs/*/spec.json`
2. Updating SQLite cache
3. Generating `docs/specs/*.md`
4. Moving change to `archive/{date}-{change-id}/`
5. Returning summary

---

## Phase 6: Verify Archive

### Check Specs Updated

For each affected capability:
```
adv_spec_show capability: <name>
```

Verify new requirements present.

### Check Archive Created

Verify `archive/{date}-{change-id}/` exists with:
- `change.json`
- `ARCHIVE_SUMMARY.md`

---

## Phase 7: Completion

### Archive Report

```
============================================================
                  ARCHIVE COMPLETE
============================================================

Change: {change-id}
Title: {title}
Archived: {timestamp}

SPECS UPDATED:
{for each capability}
- specs/{capability}/spec.json
  - Added: {add_count} requirements
  - Modified: {modify_count} requirements
  - Removed: {remove_count} requirements
{end}

DOCS GENERATED:
{for each capability}
- docs/specs/{capability}.md
{end}

ARCHIVE LOCATION:
  archive/{date}-{change-id}/

============================================================
```

### Completion Banner

```
============================================================
      /adv-archive {change-id} COMPLETE
============================================================
Result: Specs updated, change archived
============================================================
```

---

## Post-Archive Suggestions

```
NEXT STEPS:
1. Commit changes:
   git add specs/ docs/specs/ archive/
   git commit -m "chore: archive {change-id}"

2. Optional validation:
   /adv-validate --all

3. Optional hardening:
   /adv-harden <affected-files>
```

---

## Error Handling

### Delta Application Error

```
============================================================
            ARCHIVE FAILED - DELTA ERROR
============================================================

Failed delta: {delta-id}
Target: {capability}/{requirement-id}
Error: {message}

Change NOT archived. Fix and retry:
  /adv-validate {change-id}
  /adv-archive {change-id}
============================================================
```

---

## Key Tool

| Purpose | Tool |
|---------|------|
| Archive change | `adv_change_archive change_id: <id>` |

This single tool does all the work. The command orchestrates pre-checks, confirmation, and verification.
