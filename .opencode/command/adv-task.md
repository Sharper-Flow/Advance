---
name: adv-task
description: Add a task to the agenda for later - AI places it based on priority. Use /adv-quick to start immediately.
---

# ADV Task - Queue a Task for Later

Add a task to your working agenda **without starting it**. The AI places it in the queue based on priority. Use this for:
- Capturing work to do later
- Building up a backlog
- Tracking discovered tasks while working on something else
- Technical debt items to address eventually

**vs /adv-quick**: Use `/adv-quick` when you want to start working immediately. `/adv-task` just queues work for later.

## Argument Parsing

Parse `$ARGUMENTS` for the task details:

```
/adv-task <title> [--priority <level>] [--category <tag>] [--blocked-by <id>]
```

| Argument | Description | Default |
|----------|-------------|---------|
| `<title>` | Task description (required) | - |
| `--priority` | Priority level: critical, high, medium, low, backlog | medium |
| `--category` | Category tag: tests, bugfix, refactor, feature, debt | auto-detect |
| `--blocked-by` | Agenda item ID that blocks this task | none |

**Auto-detect category from title:**
- Contains "test" → `tests`
- Contains "fix", "bug" → `bugfix`
- Contains "refactor", "clean" → `refactor`
- Contains "add", "implement", "create" → `feature`
- Contains "debt", "todo" → `debt`

---

## Execution Flow

### Step 1: Parse and Validate

Extract the task title and options from arguments.

**If no title provided:**
```
Usage: /adv-task <title> [--priority <level>] [--category <tag>]

Examples:
  /adv-task Add unit tests for auth module
  /adv-task Fix login timeout bug --priority high
  /adv-task Refactor database connection pool --category refactor
```
Stop execution.

### Step 2: Check Current Agenda

Use `adv_agenda_stats` to get current agenda state:

```
Current Agenda:
  Active: <N> items
  Next up: <title of next item>
```

### Step 3: Quick Prep Analysis (Before Showing Plan)

Perform lightweight analysis to enrich the task before adding:

#### 3.1 Similar Code Check

Quick search for related code:
```
- Search codebase for key terms from task title
- Note if similar patterns exist to follow
- Identify potential files that will be affected
```

#### 3.2 Cross-Cutting Concerns Scan

Check if task implies these concerns (add to description if relevant):

| Concern | Signal in Title | Note to Add |
|---------|-----------------|-------------|
| Error Handling | "fix", "handle", "validate" | "Include error cases" |
| Testing | "add", "implement", "create" | "Add tests" |
| Security | "auth", "user", "input" | "Validate inputs" |
| Performance | "optimize", "slow", "cache" | "Measure before/after" |

#### 3.3 Conflict Detection

```
adv_change_list
```
- Check if active changes touch related areas
- If conflict likely, add note to task description

#### 3.4 TDD Determination

Determine if this task requires TDD based on title patterns:
- Logic-heavy (implement, create, fix, validate, etc.) → Recommend TDD
- Trivial (docs, config, rename, format) → Skip TDD

#### 3.5 Simplicity Check

Before finalizing:
- Is there a simpler way to accomplish this?
- Does a library already solve this? (Quick Context7 check if applicable)
- Add note if simpler approach found

---

### Step 4: Add Task with Enriched Description

Use `adv_agenda_add` to add the task with findings from prep analysis:

```json
{
  "title": "<parsed title>",
  "description": "<prep findings: files affected, concerns, conflicts, simplicity notes>",
  "priority": "<parsed or default priority>",
  "category": "<parsed or auto-detected category>"
}
```

The description should include:
- Files likely to be modified (from 3.1)
- Cross-cutting concerns identified (from 3.2)
- Conflict warnings if any (from 3.3)
- Simplicity notes if relevant (from 3.5)

### Step 5: Suggest Priority Placement

After adding, analyze where this task should fall in the current queue:

**If priority is critical or high:**
```
[!] High priority task added. Consider starting immediately.

Current queue order:
1. [ag-xxx] <this task> (NEW - <priority>)
2. [ag-yyy] <existing task>
...
```

**If there are blocking dependencies:**
```
Task added but blocked by: <blocked_by_id>
Complete the blocking task first, then this will become available.
```

**Otherwise:**
```
Task added to agenda.

Queue position: #<N> of <total>
Estimated start: After <N-1> higher priority items

To start working on it now:
  Use adv_agenda_prioritize to raise priority, or
  Use adv_agenda_start to begin immediately
```

### Step 6: TDD Recommendation

**If task requires TDD:**
```
------------------------------------------------------------
TDD RECOMMENDED

This task appears logic-heavy. Follow the Red-Green-Refactor cycle:

1. RED: Write a failing test first
   - Use adv_agenda_evidence to record test failure

2. GREEN: Implement minimal code to pass
   - Use adv_agenda_evidence to record test passing

3. REFACTOR: Clean up while tests pass
   - Use adv_agenda_complete when done
------------------------------------------------------------
```

**If task is trivial:**
```
No TDD required for this task type.
Complete with adv_agenda_complete when done.
```

---

## Output Format

```
============================================================
                TASK ADDED TO AGENDA
============================================================

ID: <ag-xxxxxxxx>
Title: <title>
Priority: <priority>
Category: <category>
Status: pending

PREP FINDINGS:
- Files: <list of likely affected files>
- Concerns: <cross-cutting concerns identified>
- Conflicts: <none | active changes in same area>
- Simplicity: <any simpler approaches noted>

Queue Position: #<N> of <total active>
TDD Required: <Yes/No>

------------------------------------------------------------
NEXT ACTIONS:

<context-specific suggestions based on priority and TDD>

============================================================
```

---

## Quick Reference

After adding a task, you can:

| Action | Command/Tool |
|--------|--------------|
| Start working | `adv_agenda_start` |
| Change priority | `adv_agenda_prioritize` |
| Record TDD evidence | `adv_agenda_evidence` |
| Complete task | `adv_agenda_complete` |
| View queue | `adv_agenda_list` |
| Get next item | `adv_agenda_next` |

---

## Examples

**Add a test task:**
```
/adv-task Add integration tests for payment processing
```

**Add a high-priority bugfix:**
```
/adv-task Fix race condition in session handler --priority critical
```

**Add a refactoring task:**
```
/adv-task Refactor user validation into separate module --category refactor
```

**Add a blocked task:**
```
/adv-task Update API documentation --blocked-by ag-abc123
```
