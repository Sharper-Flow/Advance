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
2. **If empty**: Call `adv_change_list`, select via the `question` tool

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
   - .adv/archive/{date}-{change-id}/

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

## Phase 4: Gate Status Check

### Check All Gates

```
adv_gate_status changeId: {change-id}
```

Display gate status:

```
============================================================
                    GATE STATUS
============================================================

GATES:
- [x] Research: {status}
- [x] Prep: {status}
- [x] Implementation: {status}
- [x] Review: {status}
- [x] Harden: {status}
- [ ] Signoff: pending

{if incompleteGates (excluding signoff)}
BLOCKED: Cannot archive - incomplete gates:
{for each incomplete gate}
- {gateId}: Run /{command} first
{end}
============================================================
```

**If any gates incomplete (excluding signoff)**: Stop execution with guidance.

---

## Phase 5: User Signoff (Final Gate)

Use the `question` tool for explicit user signoff:

```json
{
  "questions": [{
    "header": "Final Signoff",
    "question": "This is the final quality gate. By signing off, you confirm:\n- All requirements are implemented correctly\n- Code quality meets standards\n- Change is ready for production\n\nArchive '{change-id}' and apply to specs?",
    "options": [
      { "label": "Sign off and archive (Recommended)", "description": "I confirm this change is ready - apply deltas and archive" },
      { "label": "Dry run first", "description": "Preview what will change without committing" },
      { "label": "Cancel", "description": "Do not archive - need more work" }
    ]
  }]
}
```

**If "Sign off and archive"**: 
1. Mark signoff gate complete:
   ```
   adv_gate_complete changeId: {change-id} gateId: signoff
   ```
2. Proceed to archive execution

**If "Dry run"**: Re-run with dry-run flag.
**If "Cancel"**: Stop execution.

---

## Phase 6: Execute Archive

```
adv_change_archive change_id: <target>
```

The tool handles:
1. Applying deltas to `.adv/specs/*/spec.json`
2. Updating SQLite cache
3. Generating `docs/specs/*.md`
4. Moving change to `.adv/archive/{date}-{change-id}/`
5. Returning summary

---

## Phase 7: Verify Archive

### Check Specs Updated

For each affected capability:
```
adv_spec_show capability: <name>
```

Verify new requirements present.

### Check Archive Created

Verify `.adv/archive/{date}-{change-id}/` exists with:
- `change.json`
- `ARCHIVE_SUMMARY.md`

---

## Phase 8: Completion

### Archive Report

```
============================================================
                  ARCHIVE COMPLETE
============================================================

Change: {change-id}
Title: {title}
Archived: {timestamp}

QUALITY GATES (all complete):
- [x] Research
- [x] Prep
- [x] Implementation
- [x] Review
- [x] Harden
- [x] Signoff ← User confirmed

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
  .adv/archive/{date}-{change-id}/

============================================================
```

### Completion Banner

```
============================================================
      /adv-archive {change-id} COMPLETE
============================================================
Result: Specs updated, change archived
Proceeding to Phase 9: Git Finalization...

  ⚡ Recommended next step (Scout agent):
     /adv-status
============================================================
```

---

## Phase 9: Git Finalization (Mandatory)

This phase is **required**, not optional. All changes must be committed and merged before the archive workflow is considered complete.

### Step 1: Stage and Commit

Detect the repo root and stage all modified tracked files plus any newly created archive/spec/docs files:

```bash
# Detect repo root
git rev-parse --show-toplevel

# Stage all relevant files
git add .adv/specs/ docs/specs/ .adv/archive/ .opencode/ plugin/ \
        ADV_INSTRUCTIONS.md README.md CHANGELOG.md SETUP.md \
        docs/ --ignore-errors

# Commit (skip if nothing staged)
git diff --cached --quiet || \
  git commit -m "chore: archive {change-id} — apply deltas, update specs and docs"
```

**If commit fails**: Show error, stop — do NOT proceed to merge with uncommitted changes.

### Step 2: Detect Default Branch

```bash
# Try common names in order
git rev-parse --verify main 2>/dev/null && echo main || \
  git rev-parse --verify trunk 2>/dev/null && echo trunk || \
  git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||' || \
  echo "UNKNOWN"
```

If branch is UNKNOWN, prompt the user for the default branch name via the `question` tool.

### Step 3: Check Worktree Context

Determine if currently running in a worktree branch:

```bash
git branch --show-current
```

**If on a `change/{change-id}` branch** (worktree context):
- Proceed to Step 4 (merge required before cleanup)

**If already on the default branch** (no worktree):
- Skip merge — nothing to merge, jump to Step 5 (verify)

### Step 4: Merge to Default Branch

```bash
# Switch to default branch
git checkout {default-branch}

# Merge the change branch (no-edit to avoid interactive mode)
git merge --no-edit change/{change-id}
```

**If merge has conflicts**: Show conflict list, stop — user must resolve manually before proceeding.

**Alternative (if project uses PRs)**:
```bash
git push -u origin change/{change-id}
gh pr create --title "Archive {change-id}" --body "Merges completed change."
```

When using PR workflow, pause and ask user to merge the PR before continuing to Step 5.

### Step 5: Verify Merge Complete

```bash
git log --oneline {default-branch}..change/{change-id}
# MUST return EMPTY — all commits reachable from default branch
```

**If output is non-empty**: Merge is incomplete. Stop and show unmerged commits. Do NOT delete worktree.

### Step 6: Clean Up Worktree (If Applicable)

Only run if currently in a `change/{change-id}` worktree AND Step 5 verified empty:

```
worktree_delete reason: "Change {change-id} merged to {default-branch}"
```

**If `worktree_delete` is unavailable**: Emit `[ADV:INFO] worktree_delete not available — delete manually with: git worktree remove <path>`.

### Step 7: Clean Temp Artifacts

Remove any temporary files generated during this archive session:

```bash
# Remove common temp artifacts
find . -maxdepth 3 -name "*.bak" -o -name "*.tmp" -o -name "*.orig" | \
  grep -v node_modules | xargs rm -f 2>/dev/null || true
```

---

## Phase 9 Completion Report

```
============================================================
                 GIT FINALIZATION COMPLETE
============================================================

Commit: {short-sha} — chore: archive {change-id}
Merged to: {default-branch}
Merge verified: ✓ (no unmerged commits)
Worktree cleanup: {deleted | skipped (no worktree) | skipped (worktree_delete unavailable)}
Temp artifacts: {N removed | none found}

============================================================
        /adv-archive {change-id} FULLY COMPLETE
============================================================
```

---

## Optional Next Steps

```
OPTIONAL:
1. Push to remote:
   git push origin {default-branch}

2. Validate all specs are consistent:
   /adv-validate --all

3. Re-harden affected files:
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
