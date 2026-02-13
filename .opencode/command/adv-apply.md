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

## Gate Auto-Completion

Before starting implementation, check prerequisite gates and auto-complete if missing:

### Check Gate Status

```
adv_gate_status changeId: {change-id}
```

### Auto-Complete Missing Gates

**If research gate is pending:**

1. Quick Context7 lookup for libraries in affected files:
   - Read proposal.md to identify technologies/frameworks
   - For each library: `context7_resolve-library-id` → `context7_query-docs`
   - Document findings briefly
2. Mark gate complete:
   ```
   adv_gate_complete changeId: {change-id} gateId: research
   ```

**If prep gate is pending:**

1. Quick prep analysis:
   - Scan affected files for conflicts with other active changes
   - Check cross-cutting concerns (error handling, logging, validation)
   - Identify any obvious gaps
2. Mark gate complete:
   ```
   adv_gate_complete changeId: {change-id} gateId: prep
   ```

**Note:** The user will be notified of auto-completed gates in the confirmation prompt (see Phase 2).

---

## Phase 0: Worktree Assessment

Before implementation, assess whether this change benefits from worktree isolation.

### Step 1: Assess Risk

Count files affected in the proposal and evaluate risk:

| Signal | Risk Level |
|--------|------------|
| 5+ files affected | High — suggest worktree |
| Breaking API changes | High — suggest worktree |
| Risky refactor (structural changes) | High — suggest worktree |
| Experimental / spike work | High — suggest worktree |
| 1-2 files, low risk | Low — skip worktree |
| Docs-only or config changes | Low — skip worktree |

If risk is **Low**, skip to Phase 1.

### Step 2: Check Tool Availability

Before suggesting a worktree, verify `worktree_create` is available. If not, emit:
```
[ADV:INFO] Worktree tools not available — proceeding with in-place implementation.
```
Then skip to Phase 1.

### Step 3: Ask User

Use the `question` tool:

```json
{
  "questions": [{
    "header": "Worktree Isolation",
    "question": "This change affects {N} files and involves {reason}. I recommend creating a worktree for isolation. Branch: change/{change-id}",
    "options": [
      { "label": "Create worktree (Recommended)", "description": "Isolate work in a new tmux window with full ADV context" },
      { "label": "Work in place", "description": "Implement directly in the current branch" }
    ]
  }]
}
```

If **declined**: skip to Phase 1.

### Step 4: Write Handoff & Create Worktree

If **approved**, execute this exact sequence:

1. **Write handoff state** — the plugin automatically persists `{changeId, currentTaskId, gateStatus, objective}` to the external state directory. The new session will hydrate from this on startup.

2. **Create worktree**:
   ```
   worktree_create branch: "change/{change-id}"
   ```

3. **Stop this session** — emit:
   ```
   [ADV:EARTH] Worktree created for change {change-id}. Implementation continues in the new tmux window.
   The new session will automatically hydrate change context via [ADV:WORKTREE_SESSION].
   This session's work on this change is complete.
   ```

**CRITICAL**: After creating the worktree, do NOT continue implementation in this session. The new session inherits full ADV context (change, tasks, wisdom, gates) via shared external storage.

---

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

{if gates were auto-completed}
GATES AUTO-COMPLETED:
{for each auto-completed gate}
- {gateId}: {brief evidence}
{end}
{end}

============================================================
```

### Confirmation

Use the `question` tool. **If gates were auto-completed, include in question text:**

```json
{
  "questions": [{
    "header": "Confirm",
    "question": "Begin implementation of '{change.title}'?{if gates auto-completed}\n\nNote: The following gates were auto-completed:\n- {gateId}: {evidence}{end}",
    "options": [
      { "label": "Begin work (Recommended)", "description": "Start TDD implementation" },
      { "label": "Cancel", "description": "Exit without changes" }
    ]
  }]
}
```

---

## Phase 3: TDD Work Loop

### ⚠️ Context Freshness Policy

**CRITICAL: Do NOT batch tasks into a local todo list with descriptive blurbs.**

Before starting EACH task, you MUST:

1. **Re-read the change context** via `adv_change_show` to refresh your understanding
2. **Check the specific task details** in the change.json (not a cached summary)
3. **Read any relevant proposal sections** that describe the task requirements

**Why this matters:** Context drift causes implementation errors. When agents batch multiple tasks with abbreviated summaries, they lose nuance and make incorrect assumptions about requirements.

### TodoWrite Rules for ADV Tasks

When using the `TodoWrite` tool during `/adv-apply`:

**✅ CORRECT - IDs only (forces context lookup):**
```json
{
  "todos": [
    { "id": "1", "content": "tk-abc123", "status": "pending", "priority": "high" },
    { "id": "2", "content": "tk-def456", "status": "pending", "priority": "high" },
    { "id": "3", "content": "tk-ghi789", "status": "pending", "priority": "medium" }
  ]
}
```

**❌ WRONG - Descriptive blurbs (causes context drift):**
```json
{
  "todos": [
    { "id": "1", "content": "Add hero section with pricing", "status": "pending", "priority": "high" },
    { "id": "2", "content": "Add price display component", "status": "pending", "priority": "high" },
    { "id": "3", "content": "Add tab navigation", "status": "pending", "priority": "medium" }
  ]
}
```

**Why IDs only:** When you see `tk-abc123` in your todo list, you MUST call `adv_change_show` to understand what that task actually requires. This prevents working from stale/abbreviated mental models.

### Anti-pattern to avoid

```
❌ "I'll add these to my todo list:
   1. Add hero section
   2. Add price display
   3. Add tabs
   Then work through them..."
```

### Correct approach

```
✓ "I have 3 tasks to complete. Adding task IDs to my todo list..."
   [TodoWrite with just tk-abc123, tk-def456, tk-ghi789]
   
   "Starting tk-abc123. Let me look up what this task requires..."
   [calls adv_change_show]
   "The proposal specifies that the hero section needs compact price variants,
   not the full expanded version. Now implementing..."
```

For each task from `adv_task_ready`:

### 3a. Start Task

**Step 1: Refresh Context (MANDATORY)**

Before any implementation, re-read the change to get fresh context:

```
adv_change_show change_id: <target>
```

Review:
- The task's full description in the change.json
- Related deltas that define acceptance criteria
- Any relevant sections in proposal.md

**Step 2: Announce and Update Status**

```
[ADV:ROCKET]
Starting: {task.title}

Context refreshed from change {change-id}:
- Task requirement: {full task description from change.json}
- Acceptance criteria: {relevant delta or requirement}
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

When `adv_task_ready` returns empty AND all tasks are "done" or "cancelled":

### Verify Completion

```
adv_task_list change_id: <target>
```

Confirm all tasks show `status: "done"` or `status: "cancelled"`.

### Cancelled Task Approval

**If ANY tasks are cancelled**, use the `question` tool to get explicit user approval:

```json
{
  "questions": [{
    "header": "Cancelled Tasks",
    "question": "The following tasks were cancelled during implementation. Confirm you accept these cancellations before marking the implementation gate complete.",
    "options": [
      { "label": "Approve cancellations (Recommended)", "description": "Accept that these tasks are legitimately cancelled" },
      { "label": "Review each task", "description": "I need to see the rationale for each cancellation" },
      { "label": "Block completion", "description": "Do not mark implementation complete - need to address cancelled tasks" }
    ]
  }]
}
```

**If "Review each task"**: Display each cancelled task with its cancellation reason, then re-prompt.

**If "Block completion"**: Stop without marking the implementation gate. User must decide how to proceed.

### Final Validation

```
adv_change_validate change_id: <target>
```

Must pass before declaring complete.

### Mark Implementation Gate

After validation passes (and cancelled tasks are approved, if any):

```
adv_gate_complete changeId: {change-id} gateId: implementation
```

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

{if cancelled tasks}
CANCELLED TASKS (user approved):
{for each cancelled task}
- [~] {task.id}: {task.title} - {cancellation reason}
{end}
{end}

VALIDATION: adv_change_validate - PASSED

GATE STATUS:
- Implementation gate: COMPLETE ✓

============================================================
```

### Completion Banner

```
============================================================
      /adv-apply {change-id} COMPLETE
============================================================
Result: All tasks done, ready for /adv-review
Implementation Gate: MARKED COMPLETE
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
