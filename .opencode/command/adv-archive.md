---
name: adv-archive
description: Archive completed change: apply spec deltas and finalize git
---

# ADV Archive — Finalize Completed Change

Archive change → apply deltas to specs → mandatory Phase 9 Git Finalization (commit, merge, verify, cleanup).

## Exits

| Exit | Condition |
|------|-----------|
| ✅ Complete | All gates passed, specs updated, git finalized |
| 🎤 Blocked | Incomplete gates/tasks or merge conflicts |
| 🔁 Dry Run | Preview only, no changes |

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Parse `$ARGUMENTS`: `change-id` (required), `--dry-run` (optional).
If empty → `adv_change_list` → select via `question` tool.

---

## Phase 1: Pre-Archive Checks

1. `adv_change_show` → verify status "active"
2. `adv_task_list` → all tasks must be "done". If incomplete → ARCHIVE BLOCKED banner → stop
3. `adv_change_validate strict: true` → if fails → show errors → stop
4. `adv_status` → check for `[doctor]` entries: JSON/SQLite inconsistency or broken refs → block; pending WAL → warn only

---

## Phase 2: Archive Preview

Display: change ID/title, task count, delta count per capability, affected spec files, docs to generate, archive location.

---

## Phase 3: Dry Run

If `--dry-run` → emit DRY RUN COMPLETE → stop.

---

## Phase 4: Gate Status

`adv_gate_status` → display all 7 gates. If any incomplete before `release` → stop with guidance.

---

## Phase 5: User Signoff

Ask via `question`: "Archive '{change-id}' and apply to specs?" Options: Sign off and archive (Recommended), Dry run first, Cancel.

If approved → `adv_gate_complete changeId: {id} gateId: release` → proceed.

---

## Phase 6: Execute Archive

`adv_change_archive changeId: <target>` — applies deltas, updates SQLite, generates docs, moves to archive.

---

## Phase 7: Verify

For each affected capability: `adv_spec action: "show"` → verify new requirements present. Verify archive directory exists with change.json and ARCHIVE_SUMMARY.md.

---

## Phase 8: Archive Report

Emit ARCHIVE COMPLETE banner: change ID/title, timestamp, all 7 stages checked, specs updated (added/modified/removed counts per capability), docs generated, archive location.

---

## Phase 9: Git Finalization (Mandatory)

### Step 1: Stage and Commit

Stage `.adv/specs/`, `docs/specs/`, `.adv/archive/`, `.opencode/`, `plugin/`, `ADV_INSTRUCTIONS.md`, `README.md`, `docs/`. Commit: `chore: archive {change-id}`. If commit fails → stop.

### Step 2: Detect Default Branch

`git rev-parse --verify main` || `trunk` || `git symbolic-ref refs/remotes/origin/HEAD`. If UNKNOWN → ask user.

### Step 3: Check Context

`git branch --show-current` → if on `change/{change-id}` → merge required. If on default branch → skip merge.

### Step 4: Merge

`git checkout {default-branch}` → `git merge --no-edit change/{change-id}`. If conflicts → stop, user resolves. Alternative (PR workflow): push + `gh pr create`.

### Step 5: Verify

`git log --oneline {default-branch}..change/{change-id}` → MUST return empty. If non-empty → stop, × do NOT delete worktree.

### Step 6: Cleanup Worktree

Only if in worktree AND merge verified: `worktree_delete branch: "change/{change-id}" reason: "Change {change-id} merged"`. If unavailable → emit info.

### Step 7: Temp Artifacts

Remove `*.bak`, `*.tmp`, `*.orig` (excluding node_modules).

### Completion

Emit GIT FINALIZATION COMPLETE: commit SHA, merge target, verification status, worktree cleanup status, artifacts removed.

```
/adv-archive {change-id} FULLY COMPLETE
```

---

## Error Handling

Delta application error → ARCHIVE FAILED banner with delta ID, target, error. Change NOT archived → fix and retry.

---

## Key Tool

| Purpose | Tool |
|---------|------|
| Archive | `adv_change_archive changeId: <id>` |
