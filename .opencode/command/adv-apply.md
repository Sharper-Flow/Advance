---
name: adv-apply
description: Begin implementing an approved change - work through tasks with TDD
args:
  - name: change_id
    description: The change ID to implement
    required: true
---

# /adv-apply - Implement Change with TDD

Begin implementing an approved change by working through its tasks using Test-Driven Development.

## Arguments

- `change_id` (required): The ID of the change to implement

## Prerequisites

1. Change must exist and be in "active" status
2. Change should be validated (`/adv-validate` passed)
3. Tasks should be defined in the change

## Process

### Phase 1: Load and Verify Change

1. Call `adv_change_show` to load the change
2. Verify status is "active"
3. Call `adv_task_ready` to get available tasks

### Phase 2: Display Work Plan

```
============================================================
                   APPLYING CHANGE
============================================================
Change: {change_id}
Title: {title}
Status: {status}

TASKS:
Ready to start:
{for each ready task}
- [ ] {task.id}: {task.title}
{end}

Blocked:
{for each blocked task}
- [ ] {task.id}: {task.title}
  Blocked by: {blocked_by}
{end}

Progress: {completed}/{total} tasks complete
============================================================
```

### Phase 3: Work Loop

For each ready task, follow the TDD protocol:

#### 3a. Start Task
```
[ADV:ROCKET]

Starting task: {task.title}
```

Call `adv_task_update` with status "in_progress".

#### 3b. Red Phase (Write Test)
```
[ADV:TDD_RED]

Writing test for: {task.title}
```

1. Write the failing test first
2. Run tests to confirm failure (red phase evidence)
3. Show test output

#### 3c. Green Phase (Implement)
```
[ADV:TDD_GREEN]

Implementing: {task.title}
```

1. Write minimal code to pass the test
2. Run tests to confirm success (green phase evidence)
3. Show test output

#### 3d. Complete Task

Call `adv_task_update` with status "done".

```
Task complete: {task.title}
Evidence: {test_output_or_commit}
```

### Phase 4: Progress Update

After each task, emit status:

```
---
CHANGE STATUS:
- [x] {completed_task} (evidence: {link})
- [ ] {pending_task} (status: pending)
Progress: {completed}/{total} tasks
---
```

### Phase 5: Completion Check

When all tasks are done:

```
============================================================
                 ALL TASKS COMPLETE
============================================================
Change: {change_id}
Tasks: {total}/{total} complete

Ready to archive with /adv-archive {change_id}
============================================================
```

## Status Markers

Emit appropriate markers during work:

| Marker | When |
|--------|------|
| `[ADV:ROCKET]` | Starting work on a task |
| `[ADV:TDD_RED]` | Writing tests (red phase) |
| `[ADV:TDD_GREEN]` | Implementing (green phase) |
| `[ADV:MOON]` | Waiting for sub-agent results |
| `[ADV:DOOM_LOOP]` | Stuck in retry cycle (3+ attempts) |
| `[ADV:MIC]` | Need user decision |

## Doom Loop Protocol

If stuck on a task after 3 attempts:

1. Emit `[ADV:DOOM_LOOP]`
2. Stop retrying the same approach
3. Use `mcp_question`:
   ```
   header: "Task Blocked"
   question: "Task '{task.title}' is stuck after 3 attempts. How to proceed?"
   options:
     - label: "Try different approach"
       description: "I'll suggest an alternative solution"
     - label: "Get more context"
       description: "Ask clarifying questions"
     - label: "Mark as blocked"
       description: "Skip and continue with other tasks"
     - label: "Cancel change"
       description: "Abandon this change"
   ```

## Example

```
User: /adv-apply add-rate-limiting-abc123

Agent: [loads change, shows work plan]

[ADV:ROCKET]
Starting task: tk-rate001 - Create rate limiter middleware

[ADV:TDD_RED]
Writing test for rate limiter...
[creates test file]
[runs tests - FAIL as expected]

[ADV:TDD_GREEN]
Implementing rate limiter...
[creates implementation]
[runs tests - PASS]

Task complete: Create rate limiter middleware
Evidence: commit abc1234

---
CHANGE STATUS:
- [x] tk-rate001: Create rate limiter (evidence: abc1234)
- [ ] tk-rate002: Add rate limit headers (pending)
Progress: 1/3 tasks
---

[continues with next task...]
```

## Notes

- Follow TDD strictly: test first, then implement
- Provide evidence for each completed task
- Update task status in real-time
- Don't skip ahead - work through blocked dependencies
- Ask for help if stuck rather than spinning
