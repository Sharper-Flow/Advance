---
name: adv-archive
description: Archive a completed change - apply deltas to specs and generate docs
args:
  - name: change_id
    description: The change ID to archive
    required: true
  - name: dry_run
    description: Preview changes without writing files
    required: false
---

# /adv-archive - Archive Completed Change

Archive a completed change by applying its deltas to specs and generating documentation.

## Arguments

- `change_id` (required): The ID of the change to archive
- `dry_run` (optional): If "dry-run", preview changes without writing

## Prerequisites

1. All tasks in the change must be "done" or "cancelled"
2. Change should be validated (`/adv-validate` passed)

## Process

### Phase 1: Verify Completion

1. Call `adv_change_show` to load the change
2. Check all tasks are complete
3. If incomplete tasks exist, report and abort

### Phase 2: Preview Changes (Optional)

If `dry_run` specified, or as confirmation step:

```
============================================================
                   ARCHIVE PREVIEW
============================================================
Change: {change_id}
Title: {title}

SPECS TO UPDATE:
{for each capability}
- {capability}: {original_version} → {new_version}
  Deltas: {delta_count}
  {for each delta}
    - [{operation}] {description}
  {end}
{end}

DOCS TO GENERATE:
{for each doc}
- {doc_path}
{end}

ARCHIVE LOCATION:
{archive_path}
============================================================
```

### Phase 3: Confirm Archive

Use `mcp_question` to confirm:

```
header: "Confirm Archive"
question: "Archive this change? This will update specs and generate docs."
options:
  - label: "Archive now (Recommended)"
    description: "Apply deltas and archive the change"
  - label: "Preview only"
    description: "Show what would happen without making changes"
  - label: "Cancel"
    description: "Don't archive"
```

### Phase 4: Execute Archive

Call `adv_change_archive` with the change ID.

The archive operation:
1. Applies each delta to the target spec
2. Bumps spec versions (minor for adds, patch for modifications)
3. Writes updated specs to disk
4. Generates markdown documentation
5. Creates archive directory with change copy
6. Updates change status to "archived"

### Phase 5: Report Results

```
============================================================
                  CHANGE ARCHIVED
============================================================
Change: {change_id}
Archived At: {timestamp}

SPECS UPDATED:
{for each spec_update}
- {capability}: {original} → {new_version}
  Applied {delta_count} delta(s)
{end}

DOCS GENERATED:
{for each doc}
- {doc_path}
{end}

ARCHIVE:
{archive_path}

============================================================
```

## Error Handling

### Incomplete Tasks
```
============================================================
                 CANNOT ARCHIVE
============================================================
Change: {change_id}

INCOMPLETE TASKS:
{for each incomplete}
- {task.id}: {task.title} (status: {status})
{end}

Complete all tasks before archiving, or cancel tasks that won't be done.
============================================================
```

### Delta Application Failure
```
============================================================
               ARCHIVE FAILED
============================================================
Change: {change_id}

ERRORS:
{for each error}
- {error_message}
{end}

The archive was rolled back. Fix the issues and try again.
============================================================
```

## Dry Run Mode

```
User: /adv-archive add-rate-limiting-abc123 dry-run

Agent: [calls adv_change_archive with dryRun=true]

============================================================
                  DRY RUN RESULTS
============================================================
Change: add-rate-limiting-abc123

WOULD UPDATE:
- api-capability: 1.2.0 → 1.3.0
  + Add rq-rate001: Rate Limiting

WOULD GENERATE:
- docs/specs/api-capability.md

WOULD CREATE:
- archive/2026-01-21-add-rate-limiting-abc123/

No changes were made. Run without dry-run to apply.
============================================================
```

## Example

```
User: /adv-archive add-rate-limiting-abc123

Agent: [loads change, verifies all tasks complete]
[shows preview]
[confirms with user]
[executes archive]

============================================================
                  CHANGE ARCHIVED
============================================================
Change: add-rate-limiting-abc123
Archived At: 2026-01-21T15:30:00Z

SPECS UPDATED:
- api-capability: 1.2.0 → 1.3.0
  Applied 2 delta(s)

DOCS GENERATED:
- docs/specs/api-capability.md

ARCHIVE:
archive/2026-01-21-add-rate-limiting-abc123/

============================================================
```

## Post-Archive

After archiving:
- The change is immutable (status: "archived")
- Specs are updated with new requirements
- Documentation reflects the changes
- The archive directory contains a copy of the change for history

## Notes

- Archive is a one-way operation - changes cannot be "unarchived"
- Use dry-run first to preview changes
- All deltas must apply successfully or the operation fails
- Version bumping follows semantic versioning (minor for features, patch for fixes)
