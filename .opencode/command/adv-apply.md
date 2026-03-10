---
name: adv-apply
description: Implement change with TDD, retry on failure, and final verification
agent: build
---

# ADV Apply — Implement Change with TDD and Retry

Implement an ADV change using Test-Driven Development. Every task is pursued to completion. Failures trigger diagnosis and retry before escalating.

## Task Completion Policy

Every task ends in exactly one of these states:

| Exit | Condition |
|------|-----------|
| ✅ **Done** | Implementation verified, tests pass |
| 🔁 **Doom Loop** | 3 genuine fix attempts failed with documented diagnosis |
| 🌍 **Environmental** | Missing external dependency (API key, service down) — escalate immediately |

**Cross-repo tasks:** Execute in the target repo. Switch `workdir` to the target path. "Different repo" is never a valid exit.

**Cancellation:** Use `adv_task_cancel` with user approval. `adv_task_update status: cancelled` is rejected.

| BAD | GOOD |
|-----|------|
| "Let's skip this for now" | Apply retry protocol |
| "We can come back to this" | Complete now or exhaust retries |
| "This targets another repo" | Switch `workdir` and execute |
| `adv_task_update status: cancelled` | `adv_task_cancel` with user approval |

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, then:
   - If one active change: Confirm with the `question` tool
   - If multiple: Present selection with the `question` tool
   - If none: Suggest `/adv-proposal`

---

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

**Note:** The user will be notified of auto-completed gates in the confirmation prompt (see Phase 1).

---

## Phase 0: Worktree Assessment

Before implementation, assess whether this change benefits from worktree isolation. `/adv-apply` defaults to worktree isolation for multi-file changes — only skip for trivially small changes.

### Step 1: Assess Risk

Count files affected in the proposal and evaluate risk:

| Signal | Risk |
|--------|------|
| 3+ files affected | High — suggest worktree |
| Breaking API changes | High — suggest worktree |
| DB schema change | High — suggest worktree |
| Auth logic change | High — suggest worktree |
| Shared type changes | High — suggest worktree |
| Structural refactor | High — suggest worktree |
| Experimental / spike work | High — suggest worktree |
| 1–2 files, trivial changes only | Low — skip worktree |
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
      "question": "This change affects {N} files and involves {reason}. I recommend creating a worktree to contain blast radius. Branch: change/{change-id}",
      "options": [
      { "label": "Create worktree (Recommended)", "description": "Isolate work and continue inline in this session" },
      { "label": "Work in place", "description": "Implement directly in the current branch (higher risk for multi-file changes)" },
      { "label": "Other", "description": "Use custom text area to propose a different setup" }
      ]
  }]
}
```

If **declined**: skip to Phase 1.

### Step 4: Create and Switch Inline

If **approved**, execute this exact sequence:

1. **Emit navigation hint BEFORE creating the worktree** — `worktree_create` may open a new tmux window and shift focus, so the user must see navigation keys in the current window first:

   ```
   Creating worktree for change/{change-id}...

   A new tmux tab may open. To navigate back here:
     • Ctrl+b l          — last (previously active) window
     • Ctrl+b n / p      — next / previous window
     • Ctrl+b w          — interactive window chooser
     • oc switch         — switch between openchad sessions

   Implementation continues inline in this session via workdir.
   ```

2. **Create worktree**:
   ```
   worktree_create branch: "change/{change-id}"
   ```

3. **Capture worktree path** from tool output and confirm:

   ```
   ✅ Worktree ready: {worktree-path}
   Branch: change/{change-id}
   ```

4. **Switch to inline worktree execution** by setting `workdir` to the returned path for all subsequent tool calls.

5. **Continue implementation in this same session**. Do not stop after worktree creation.

6. **Optional fallback**: If you are explicitly using multi-session workflow, you may use handoff and continue in a separate session.

---

## Cross-Repo Execution Protocol

Tasks may target repositories other than the current one. This is common in full-stack features
where frontend changes require corresponding backend, database, or infrastructure changes.

### Step 1: Detect Cross-Repo Tasks

When loading tasks from `adv_task_list`, check each task for:
- `target_repo` or `target_path` fields set in task metadata
- Task title containing path hints (e.g., `~/dev/pokeedge`, `backend/`, `api/`, `db/`, `migrations/`)
- Proposal.md mentioning changes to external repositories

### Step 2: Resolve Target Repository

For tasks with `target_repo` set:
1. Load project config to get `related_repos` mapping
2. Resolve `target_repo` ID to an absolute `path`
3. If no `related_repos` config exists, use `target_path` directly

For tasks with path hints in title but no explicit metadata:
1. Use the `question` tool to confirm the target directory with the user
2. Record the resolved path for subsequent tasks

### Step 3: Execute in Target Repo

For each cross-repo task:

1. **Switch workdir**: Set `workdir` to the resolved target repo path for all tool calls related to this task
2. **Execute normally**: Run the same TDD workflow (red/green) in the target repo
3. **Return to source**: After completing the task, switch `workdir` back to the source repo

```
[ADV:ROCKET]
Starting cross-repo task: {task.title}
Target: {target_path} (repo: {target_repo})
Switching workdir to {target_path}...
```

### Prohibited Cancellation Reasons

The following are NOT valid reasons to cancel a task:

| Prohibited Reason | Why It's Invalid | Correct Action |
|-------------------|------------------|----------------|
| "Out of scope for this repo" | Cross-repo tasks are in-scope by design | Switch workdir and execute |
| "Different repository" | The task explicitly targets another repo | Switch workdir and execute |
| "Cannot modify external code" | You have filesystem access | Use workdir parameter |
| "Backend/API changes needed" | That's the task's purpose | Switch workdir and execute |
| "Would need database changes" | That's the task's purpose | Switch workdir and execute |

---

## Cancellation Policy

**All cancellations require explicit user approval.** The `adv_task_update` tool rejects `status: "cancelled"`.
Use `adv_task_cancel` instead.

### To Cancel Tasks

1. **Collect reasons**: Prepare a per-task reason for each task you want to cancel
2. **Present to user**: Use the `question` tool to show all proposed cancellations:

```json
{
  "questions": [{
    "header": "Approve Cancellations",
    "question": "The following tasks are proposed for cancellation:\n\n{for each task}\n- {task.id}: {task.title}\n  Reason: {reason}\n  {if superseded_by}Replaced by: {superseded_by}{end}\n{end}\n\nDo you approve these cancellations?",
    "options": [
      { "label": "Approve all (Recommended)", "description": "Cancel all listed tasks" },
      { "label": "Review individually", "description": "Decide each task separately" },
      { "label": "Reject", "description": "Do not cancel any tasks" },
      { "label": "Other", "description": "Use custom text area for a different cancellation plan" }
    ]
  }]
}
```

3. **Execute cancellation** (only after user approval):

```
adv_task_cancel taskIds: [...] reasons: {...} approvedByUser: true approvalEvidence: "User selected 'Approve all' via question tool"
```

---

## Phase 1: Load Change Context

### Step 1: Fetch Change Data

```
adv_change_show changeId: <target>
```

Extract from response:
- `title`, `summary` for objective
- `status` (must be "active" to proceed)
- `deltas` for acceptance criteria

### Step 2: Fetch Task State

```
adv_task_list changeId: <target>
```

Extract:
- Total task count
- Completed count
- Task details (id, title, status, blocked_by)

### Step 3: Get Ready Tasks

```
adv_task_ready changeId: <target>
```

Returns tasks that can be started (not blocked, not done).

---

## Phase 2: Display Contract

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
- [ ] (C{n+3}) Global Final Loop verification passed

TASKS (from adv_task_list):
{for each task}
- [{task.status == "done" ? "x" : " "}] {task.id}: {task.title}
  {if task.blocked_by} Blocked by: {blocked_by}{end}
{end}

Progress: {done_count}/{total_count} tasks

RETRY POLICY:
- SEMANTIC errors (type/logic/test): 3 retries with diagnosis
- TRANSIENT errors (network/flaky): 1 retry with 5s delay
- ENVIRONMENTAL errors (missing deps): immediate escalation
- Global Final Loop required before CONTRACT FULFILLED

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
    "question": "Begin TDD implementation of '{change.title}'?{if gates auto-completed}\n\nNote: The following gates were auto-completed:\n- {gateId}: {evidence}{end}",
    "options": [
      { "label": "Begin work (Recommended)", "description": "Start TDD implementation with retry" },
      { "label": "Modify criteria", "description": "Adjust before starting" },
      { "label": "Cancel", "description": "Exit without changes" },
      { "label": "Other", "description": "Use custom text area for a different direction" }
    ]
  }]
}
```

---

## Retry Protocol

### Error Classification

When verification fails, classify BEFORE acting:

| Type | Examples | Action |
|------|----------|--------|
| **SEMANTIC** | Type errors, test failures, logic bugs | Diagnose → Fix → Retry (3x) |
| **TRANSIENT** | Network timeout, flaky test | Wait 5s → Retry once |
| **ENVIRONMENTAL** | Missing dep, config not found | Escalate immediately |

### Diagnosis Requirement (Reflexion)

Before ANY fix for SEMANTIC errors:

```
[ADV:DOOM_LOOP] RETRY 1/3

DIAGNOSIS: The test fails because calculateTotal() returns undefined when
the cart is empty. The function lacks a guard clause.

FIX: Add early return of 0 when items.length === 0.

Applying fix...
```

The diagnosis MUST appear before fix is applied. This ensures:
1. You understand root cause
2. User can see reasoning
3. No repeated ineffective fixes

### Retry Budget

Track per verification failure. Budget **resets per task**.

```
[ADV:DOOM_LOOP] RETRY 1/3 - SEMANTIC
DIAGNOSIS: ...
FIX: ...
<verify>

[ADV:DOOM_LOOP] RETRY 2/3 - SEMANTIC
DIAGNOSIS: Previous fix addressed symptom not cause...
FIX: ...
<verify>
```

### Recording error_recovery on Tasks

When a task enters retry, record structured recovery state using `adv_task_update` with notes, and update the task's `error_recovery` field via the store. This enables downstream commands (`/adv-review`, `/adv-harden`) to surface retry history.

**After each failed attempt**, update the task metadata:

```
adv_task_update taskId: {task.id} status: "in_progress" notes: "RETRY {n}/3 - {error_class}: {last_error}"
```

The `error_recovery` field on the task JSON captures:
- `last_error`: The specific error message from the last failure
- `retry_count`: Current attempt number (1-indexed)
- `max_retries`: 3 for SEMANTIC, 1 for TRANSIENT
- `error_class`: TRANSIENT | SEMANTIC | ENVIRONMENTAL | FATAL
- `next_strategy`: Planned fix approach for the next attempt

**On task success**, the `error_recovery` field is left as-is (historical record). The task status transitions to `done` which supersedes it.

### Budget Exhaustion

If 3 retries fail (4 total attempts), STOP:

```
============================================================
         RETRY BUDGET EXHAUSTED
============================================================

TASK: {task.id}: {task.title}

ATTEMPTS (must show ALL 3):
1. DIAGNOSIS: {root cause analysis}
   FIX: {what was tried}
   RESULT: {specific error}

2. DIAGNOSIS: {why attempt 1 failed, new analysis}
   FIX: {different approach}
   RESULT: {specific error}

3. DIAGNOSIS: {why attempt 2 failed, new analysis}
   FIX: {third approach}
   RESULT: {specific error}

PERSISTENT ERROR:
{final error message}

BLOCKING REASON (select one):
[ ] SEMANTIC - Logic/algorithm fundamentally flawed, need design change
[ ] KNOWLEDGE - Missing domain knowledge or context
[ ] ENVIRONMENTAL - External dependency unavailable

============================================================
```

**IMPORTANT:** You CANNOT reach this state without showing 3 genuine, distinct fix attempts above. Each attempt must have a different diagnosis and approach. Repeating the same fix does not count.

Then use the `question` tool:
```json
{
  "questions": [{
    "header": "Budget Exhausted",
    "question": "3 retry attempts failed for '{task.title}'. All attempts documented above.",
    "options": [
      { "label": "Provide hint (Recommended)", "description": "Give me guidance to try a 4th approach" },
      { "label": "Take over task", "description": "User will complete this task manually" },
      { "label": "Void contract", "description": "Cancel entire change - this is a fundamental blocker" },
      { "label": "Other", "description": "Use custom text area for a different recovery path" }
    ]
  }]
}
```

**NOTE:** "Skip task" is NOT an option. The task must be completed, taken over by user, or the entire contract voided. The agent cannot cancel individual tasks without user approval via `adv_task_cancel`.

---

## Phase 3: TDD Work Loop

### ⚠️ Context Freshness Policy (MANDATORY)

**CRITICAL: Do NOT batch tasks into a local todo list with descriptive blurbs.**

Before starting EACH task, you MUST:

1. **Re-read the change context** via `adv_change_show` to refresh your understanding
2. **Check the specific task details** in the change.json (not a cached summary)
3. **Read any relevant proposal sections** that describe the task requirements

**Why this matters:** Context drift causes implementation errors. When agents batch multiple tasks with abbreviated summaries, they lose nuance and make incorrect assumptions about requirements.

**Context Snapshot:** `adv_change_show` now includes a `_contextSnapshot` field — a compact visual summary of change state (gates, tasks, current task, workdir). This is emitted automatically on every re-read, keeping the user informed of where the agent is in the change lifecycle.

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

### ⚠️ Anti-Patterns (PROHIBITED)

| Anti-Pattern | Why It's Wrong | Correct Behavior |
|--------------|----------------|------------------|
| "Let's skip this for now" | Avoids the problem | Apply retry protocol |
| "We can come back to this" | Defers without reason | Complete now or exhaust retries |
| "This might need manual work" | Offloads to user prematurely | Try 3 times first |
| "I'm not sure how to proceed" | Gives up too early | Research, diagnose, attempt fix |
| "Would you like me to skip?" | Seeks permission to avoid | Never offer skip as option |
| "This is complex, let's defer" | Complexity is not a blocker | Break down and implement |
| "Tests are flaky, marking done" | False completion | Fix flaky tests or document as environmental |
| Marking "blocked" after 1 try | Premature surrender | Must attempt 3 distinct fixes |
| "This targets another repo" | Cross-repo is in-scope | Switch workdir and execute |
| "Out of scope for this codebase" | Change defines scope, not repo | Switch workdir and execute |
| Direct `adv_task_update status: cancelled` | Bypasses approval | Use `adv_task_cancel` with user signoff |

### Task Flow

```
adv_task_ready changeId: <id>
```

For each ready task:

### 3a. Start Task

**Step 1: Refresh Context (MANDATORY)**

Before any implementation, re-read the change to get fresh context:

```
adv_change_show changeId: <target>
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
adv_task_update taskId: {task.id} status: "in_progress"
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
   3. If fails: Apply **Retry Protocol**
4. Show evidence: `Test passes: <output snippet>`

### 3d. Complete Task

Update task state:
```
adv_task_update taskId: {task.id} status: "done"
```

```
Task complete: {task.title}
Evidence: {test output or commit hash}
```

### 3e. Refresh Ready Tasks

After each completion:
```
adv_task_ready changeId: <target>
```

Continue with next ready task.

### Incremental Verification

After EACH task:
1. Run verification (build, tests, lint)
   2. If fails: Apply Retry Protocol
3. Only mark complete after pass

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

## Phase 5: Global Final Loop

Before CONTRACT FULFILLED:

```
============================================================
              GLOBAL FINAL LOOP VERIFICATION
============================================================

Running full verification suite...
- [ ] Full build
- [ ] All tests
- [ ] No lint errors
- [ ] No type errors

============================================================
```

Execute ALL verification. If any fail:
1. Apply Retry Protocol
2. Continue until all pass OR budget exhausted

---

## Phase 6: Completion

Only after Global Final Loop passes:

### Pre-Completion Checklist

Before declaring CONTRACT FULFILLED, verify:

```
============================================================
              PRE-COMPLETION VERIFICATION
============================================================

TASK AUDIT:
{for each task}
- {task.id}: {task.title}
  Status: {status}
  Evidence: {test output, commit, or "user takeover"}
  {if status != "done" and status != "cancelled"} ⚠️ INCOMPLETE - CANNOT FULFILL CONTRACT
{end}

SKIP/DEFER CHECK:
- [ ] No tasks were skipped
- [ ] No tasks marked "blocked" without 3 retry attempts
- [ ] No tasks deferred "for later"
- [ ] All "trivial" task skips have documented rationale

============================================================
```

**If ANY task is incomplete without proper documentation, you CANNOT proceed to CONTRACT FULFILLED.**

### Cancelled Task Verification

**If ANY tasks are cancelled**, verify each has structured cancellation metadata:

1. Check that every cancelled task has a `cancellation` field with `approved_by_user: true`
2. If any cancelled task lacks approval metadata (e.g., legacy data), use the `question` tool to get retroactive approval:

```json
{
  "questions": [{
    "header": "Unapproved Cancellations",
    "question": "The following cancelled tasks lack user approval records:\n\n{for each unapproved task}\n- {task.id}: {task.title}\n  Cancellation reason: {task.completed_by or 'unknown'}\n{end}\n\nApprove these cancellations?",
    "options": [
      { "label": "Approve cancellations (Recommended)", "description": "Accept that these tasks are legitimately cancelled" },
      { "label": "Review each task", "description": "I need to see the rationale for each cancellation" },
      { "label": "Block completion", "description": "Do not mark implementation complete - need to address cancelled tasks" },
      { "label": "Other", "description": "Use custom text area for a different completion decision" }
    ]
  }]
}
```

**If "Review each task"**: Display each cancelled task with its cancellation reason, then re-prompt.

**If "Block completion"**: Stop without marking the implementation gate. User must decide how to proceed.

### Final Validation

```
adv_change_validate changeId: <target>
```

Must pass before declaring complete.

### Mark Implementation Gate

After pre-completion verification passes (and cancelled tasks are approved, if any):

```
adv_gate_complete changeId: {change-id} gateId: implementation
```

### Contract Fulfilled Banner

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: {change.title}

ALL CRITERIA MET:
- [x] (C1) {criterion}
- [x] Global Final Loop - PASSED

{if cancelled tasks}
CANCELLED TASKS (user approved):
{for each cancelled task}
- [~] {task.id}: {task.title} - {cancellation reason}
{end}
{end}

COMPLETION MODE:
{one of}
- UNASSISTED - All tasks completed without human intervention
- GUIDED - {N} tasks required user hints
- PARTIAL TAKEOVER - {N} tasks completed by user

GATE STATUS:
- Implementation gate: COMPLETE ✓

============================================================
```

**Completion mode definitions:**
- **UNASSISTED**: All tasks done by agent, no hints needed
- **GUIDED**: Agent completed all tasks but needed user hints for some
- **PARTIAL TAKEOVER**: User manually completed some tasks

### Completion Banner

```
============================================================
      /adv-apply {change-id} COMPLETE
============================================================
Result: CONTRACT FULFILLED (retry-on-failure enabled)
Completion: {UNASSISTED | GUIDED | PARTIAL TAKEOVER}
Tasks: {completed}/{total}
Implementation Gate: MARKED COMPLETE

  ⚡ Recommended next step (Refine agent):
     /adv-review {change-id}
============================================================
```

---

## Doom Loop Protocol (Trivial Tasks)

For non-logic tasks (docs, config):

```
[ADV:ROCKET]
Task: {task.title} (trivial: {rationale})
```

Skip Red/Green phases. Verify manually, then:
```
adv_task_update taskId: {task.id} status: "done"
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
