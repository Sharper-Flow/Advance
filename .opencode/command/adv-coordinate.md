---
name: adv-coordinate
description: Detect and resolve conflicts across multiple active changes
agent: general
---

# ADV Coordinate — Multi-Change Conflict Detection

Analyze all active changes to detect file overlaps, semantic conflicts, and dependency cycles.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

## Pre-flight Checks

### Check for Active Changes

```
adv_change_list
```

**If no changes:**
```
============================================================
                COORDINATION DASHBOARD
============================================================

No active changes to coordinate.

RECOMMENDATION:
> Run /adv-proposal to create a new change
============================================================
```
Stop.

**If only one change:**
```
============================================================
                COORDINATION DASHBOARD
============================================================

Only one active change - coordination not needed.

ACTIVE: {change-id}
Progress: {N/M tasks}

RECOMMENDATION:
> Check back when multiple changes are active
============================================================
```
Stop.

### Worktree Context Propagation

When running from a worktree, file overlap detection must use the correct working directory to verify file existence and read file contents.

**Detect current working directory:**

```bash
pwd
```

Record the result as `{workdir}`. Use `{workdir}` as the base path for all file reads, glob patterns, and grep operations in Phase 2 analysis.

---

## Phase 1: State Collection

For each active change, call:
```
adv_change_show changeId: <id>
```

Extract:
- Affected files
- Requirements from deltas
- Task dependencies

Build coordination state:
- `changes`: Map of change-id -> affected files
- `locks`: Map of file -> owning change-ids
- `requirements`: Map of change-id -> requirements

---

## Phase 2: Analysis

### Overlap Detection

Identify files modified by 2+ changes (hot files).

### Semantic Conflict Detection

Compare requirements across changes for:
- Same identifier targeted by different changes
- Incompatible actions (Rename vs Update, Delete vs Modify)

### Dependency Cycle Detection

Check if changes form circular dependencies:
- Change A blocks Change B
- Change B blocks Change A (cycle)

---

## Phase 3: Report

```
============================================================
                COORDINATION DASHBOARD
============================================================

ACTIVE CHANGES: {N}
------------------------------------------------------------
{change-id-1}     {N/M tasks}    {file_count} files
{change-id-2}     {N/M tasks}    {file_count} files

HOT FILES (Overlaps)
------------------------------------------------------------
{if overlaps}
! {file-path} : Modified by {id1}, {id2}
{else}
No file overlaps detected.
{end}

SEMANTIC CONFLICTS
------------------------------------------------------------
{if conflicts}
? {identifier} :
  - {id1} ({action}): {requirement}
  - {id2} ({action}): {requirement}
{else}
No semantic conflicts detected.
{end}

DEPENDENCIES & CYCLES
------------------------------------------------------------
{if cycles}
X CYCLE: {id-a} -> {id-b} -> {id-a} (BLOCKING)
{else}
No dependency cycles detected.
{end}

SUGGESTED SEQUENCE
------------------------------------------------------------
{based on findings}
1. {highest priority action}
2. {next action}

============================================================
```

---

## Suggested Sequence Logic

| Finding | Priority | Recommendation |
|---------|----------|----------------|
| Cycles | CRITICAL | "RESOLVE: Break dependency between {changes}" |
| Hot files (3+) | HIGH | "SERIALIZE: Implement {change} first" |
| Semantic conflicts | HIGH | "REVIEW: {id1} and {id2} both target {identifier}" |
| Hot files (2) | MEDIUM | "COORDINATE: {id1} and {id2} modify {file}" |

---

## Completion Banner

```
============================================================
      /adv-coordinate COMPLETE
============================================================
Result: {N changes analyzed | No coordination needed}

  ⚡ Recommended next step (Plan agent):
     /adv-proposal <summary>
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| List changes | `adv_change_list` |
| Show change | `adv_change_show` |
