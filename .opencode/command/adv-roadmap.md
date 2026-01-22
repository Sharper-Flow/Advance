---
name: adv-roadmap
description: Display tiered progress dashboard for specs and changes
agent: general
---

# ADV Roadmap - Progress Dashboard

Display a tiered progress dashboard showing project status across specs and changes.

## Data Collection

### Get Project Status

```
adv_status
```

This returns:
- Spec count and details
- Active change count and progress
- Archived changes

### Get Change Details

```
adv_change_list
```

For each active change:
```
adv_task_list change_id: <id>
```

Calculate progress: completed_tasks / total_tasks

---

## Tiering Logic

Tier items based on progress and status:

| Tier | Criteria |
|------|----------|
| **NOW** | Changes with >0% completion (work in progress) |
| **NEXT** | Changes with 0% completion (not started) |
| **LATER** | Archived changes (100% complete) |

---

## Output Format

```
============================================================
                    PROJECT ROADMAP
============================================================

SPECS (The Laws)
----------------
{spec_count} capabilities defined
{for top 5 specs}
  - {capability}: {requirement_count} requirements
{end}

NOW (In Progress)
-----------------
{for each in-progress change}
  [{progress_bar}] {change-id} ({done}/{total} tasks)
    {title}
{end}

NEXT (Ready)
------------
{for each not-started change}
  [{progress_bar}] {change-id} ({0}/{total} tasks)
    {title}
{end}

LATER (Complete)
----------------
{for recent archived changes}
  [{progress_bar}] {change-id} ({total}/{total} tasks)  DONE
{end}

============================================================
Total: {item_count} items | {completed_tasks}/{total_tasks} tasks ({percent}%)
============================================================
```

### Progress Bar Rendering

Use 10-character bars:
- `█` (filled) for completed portion
- `░` (empty) for remaining

Calculate: `round(percentage / 10)` filled blocks

Examples:
- 0%: `[░░░░░░░░░░]`
- 50%: `[█████░░░░░]`
- 100%: `[██████████]`

Items at 100% show `DONE` badge.

---

## Special Cases

### All Complete

```
============================================================
                    PROJECT ROADMAP
============================================================

All roadmap items complete!

LATER (Complete)
----------------
  [██████████] feature-a (10/10 tasks)  DONE
  [██████████] feature-b (5/5 tasks)  DONE

============================================================
Total: 2 items | 15/15 tasks (100%)
============================================================
```

### No Items

```
============================================================
                    PROJECT ROADMAP
============================================================

No active roadmap items found.

SPECS: {count} capabilities defined

Run /adv-proposal to create a new change.
============================================================
```

---

## Completion Banner

```
============================================================
      /adv-roadmap COMPLETE
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Project status | `adv_status` |
| List changes | `adv_change_list` |
| Task progress | `adv_task_list` |
