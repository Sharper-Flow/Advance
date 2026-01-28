---
name: adv-apply
description: Implement an ADV change using TDD - tasks tracked via ADV tools, progress shown via contract banners
agent: build
---

# ADV Apply - Implement Change with TDD

Implement an ADV change by working through tasks using Test-Driven Development. Task state is managed by ADV tools; contract banners provide visibility.

## ⚠️ Task Completion Policy

Tasks should be completed, not skipped or deferred. If stuck:

1. **First**: Try a different approach (at least 3 attempts)
2. **Then**: Ask for user guidance via doom loop protocol
3. **Never**: Skip tasks, defer "for later", or mark blocked without genuine attempts

See Doom Loop Protocol section for proper handling of stuck tasks.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, then:
   - If one active change: Confirm with the `question` tool
   - If multiple: Present selection with the `question` tool
   - If none: Suggest `/adv-proposal`

## Phase 1: Load Change Context

### Step 1: Fetch Change Data

```
adv_change_show change_id: <target>
```

Extract from response:
- `title`, `summary` for objective
- `status` (must be "active" to proceed)
- `deltas` for acceptance criteria

### Step 2: Fetch Task State

```
adv_task_list change_id: <target>
```

Extract:
- Total task count
- Completed count
- Task details (id, title, status, blocked_by)

### Step 3: Get Ready Tasks

```
adv_task_ready change_id: <target>
```

Returns tasks that can be started (not blocked, not done).

---

## Phase 2: Display Contract (Derived from Tools)

Generate contract banner **from tool outputs** (not hardcoded):

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: {change.title}

SUCCESS CRITERIA (from change deltas):
{for each delta with type "add" or "modify"}
- [ ] (C{n}) {delta.title or requirement summary}
{end}
- [ ] (C{n+1}) All tasks completed
- [ ] (C{n+2}) Build passes

TASKS (from adv_task_list):
{for each task}
- [{task.status == "done" ? "x" : " "}] {task.id}: {task.title}
  {if task.blocked_by} Blocked by: {blocked_by}{end}
{end}

Progress: {done_count}/{total_count} tasks

============================================================
```

### Confirmation

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Confirm",
    "question": "Begin implementation of '{change.title}'?",
    "options": [
      { "label": "Begin work (Recommended)", "description": "Start TDD implementation" },
      { "label": "Cancel", "description": "Exit without changes" }
    ]
  }]
}
```

---

## Phase 3: TDD Work Loop

For each task from `adv_task_ready`:

### 3a. Start Task

```
[ADV:ROCKET]
Starting: {task.title}
```

Update task state:
```
adv_task_update change_id: <target> task_id: {task.id} status: "in_progress"
```

### 3b. Red Phase

```
[ADV:TDD_RED]
Writing test for: {task.title}
```

1. Write failing test
2. Run tests, capture failure output
3. Show evidence: `Test fails as expected: <output snippet>`

### 3c. Green Phase

```
[ADV:TDD_GREEN]
Implementing: {task.title}
```

1. Write minimal code to pass
2. Run tests, capture success output
3. Show evidence: `Test passes: <output snippet>`

### 3d. Complete Task

Update task state:
```
adv_task_update change_id: <target> task_id: {task.id} status: "done"
```

```
Task complete: {task.title}
Evidence: {test output or commit hash}
```

### 3e. Refresh Ready Tasks

After each completion:
```
adv_task_ready change_id: <target>
```

Continue with next ready task.

---

## Phase 4: Progress Tracking

After EACH task, emit CONTRACT STATUS derived from current tool state:

```
---
CONTRACT STATUS (from adv_task_list):
{for each task}
- [{status == "done" ? "x" : " "}] {task.id}: {task.title}
  {if done} (evidence: {evidence}){end}
  {if in_progress} (status: in progress){end}
  {if blocked} (blocked by: {blocked_by}){end}
{end}
Phase: TDD | Tasks: {done}/{total}
---
```

---

## Phase 5: Completion

When `adv_task_ready` returns empty AND all tasks are "done":

### Verify Completion

```
adv_task_list change_id: <target>
```

Confirm all tasks show `status: "done"`.

### Final Validation

```
adv_change_validate change_id: <target>
```

Must pass before declaring complete.

### Contract Fulfilled Banner

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: {change.title}

ALL TASKS COMPLETE (from adv_task_list):
{for each task}
- [x] {task.id}: {task.title}
{end}

VALIDATION: adv_change_validate - PASSED

============================================================
```

### Completion Banner

```
============================================================
      /adv-apply {change-id} COMPLETE
============================================================
Result: All tasks done, ready for /adv-archive
============================================================
```

---

## Doom Loop Protocol

If same task fails 3 times:

1. Emit `[ADV:DOOM_LOOP]`
2. Document ALL 3 attempts with diagnosis
3. STOP retrying
4. Use the `question` tool:
   ```json
   {
     "questions": [{
       "header": "Task Blocked",
       "question": "Task '{task.title}' stuck after 3 documented attempts. See diagnosis above.",
       "options": [
         { "label": "Provide hint (Recommended)", "description": "Give guidance for a 4th attempt" },
         { "label": "User takes over", "description": "I'll complete this task manually" },
         { "label": "Cancel change", "description": "Abort entire change" }
       ]
     }]
   }
   ```

**NOTE:** "Skip" and "defer" are NOT options. Each attempt must be documented with:
- What was tried
- Why it failed  
- What was learned

If "User takes over":
```
adv_task_update change_id: <target> task_id: {task.id} status: "blocked" notes: "User takeover after 3 attempts"
```

The user must then complete the task before the change can be archived.

---

## Trivial Tasks

For non-logic tasks (docs, config):

```
[ADV:ROCKET]
Task: {task.title} (trivial: {rationale})
```

Skip Red/Green phases. Verify manually, then:
```
adv_task_update change_id: <target> task_id: {task.id} status: "done"
```

Include rationale in status:
```
- [x] {task.id}: Update README (trivial: docs, manual review)
```

---

## Key Principle

**All state lives in ADV tools. Contract banners are views, not source of truth.**

| State | Tool | Display |
|-------|------|---------|
| Task status | `adv_task_update` | CONTRACT STATUS block |
| Task list | `adv_task_list` | Task checkboxes |
| Ready tasks | `adv_task_ready` | "Next task" selection |
| Change data | `adv_change_show` | OBJECTIVE in banner |
| Validation | `adv_change_validate` | Pass/fail line |
