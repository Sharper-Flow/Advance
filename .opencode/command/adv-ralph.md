---
name: adv-ralph
description: Implement change with autonomous retry on failures - extends adv-apply with retry protocol
agent: build
---

# ADV Ralph - Autonomous Implementation with Retry

Implement an ADV change with **autonomous retry enabled**. This extends `/adv-apply` with automatic error diagnosis and retry on failures.

## ⛔ CRITICAL: NO SKIP / NO DEFER POLICY

**This command enforces MANDATORY task completion.** Agents MUST NOT:

- ❌ Skip tasks "to revisit later"
- ❌ Defer tasks "until more information is available"  
- ❌ Mark tasks as blocked without exhausting ALL retry attempts
- ❌ Suggest "manual completion" by the user
- ❌ Propose partial implementation as acceptable
- ❌ Ask the user if they want to skip a difficult task

**The ONLY acceptable exits from a task are:**

1. ✅ **Task completed** - Implementation verified, tests pass
2. ✅ **Retry budget exhausted** - 3 genuine fix attempts failed with documented diagnosis
3. ✅ **Environmental blocker** - Missing external dependency (API key, service down, etc.)

**If you catch yourself wanting to skip or defer:** STOP. This is the autonomous retry protocol. Your job is to solve the problem, not avoid it. Apply the retry protocol.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Same as `/adv-apply`:
1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, select via `mcp_question`

---

## Phase 1: Load and Display Contract

Same as `/adv-apply`, plus retry protocol section:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: {title}

SUCCESS CRITERIA:
- [ ] (C1) {criterion from proposal}
- [ ] (C2) {criterion from proposal}
- [ ] (C3) All tasks completed
- [ ] (C4) Build passes
- [ ] (C5) Global Final Loop verification passed

AUTONOMOUS RETRY ENABLED:
- SEMANTIC errors (type/logic/test): 3 retries with diagnosis
- TRANSIENT errors (network/flaky): 1 retry with 5s delay
- ENVIRONMENTAL errors (missing deps): immediate escalation
- Global Final Loop required before CONTRACT FULFILLED

============================================================
```

### Confirmation

```
header: "Confirm"
question: "Begin autonomous implementation of '{title}'?"
options:
  - label: "Begin Autonomous Implementation (Recommended)"
    description: "Start with autonomous retry on failures"
  - label: "Modify criteria"
  - label: "Cancel"
```

---

## Autonomous Retry Protocol

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

### Budget Exhaustion

If 3 retries fail (4 total attempts), STOP:

```
============================================================
        AUTONOMOUS RETRY BUDGET EXHAUSTED
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

Then `mcp_question`:
```
header: "Budget Exhausted"
question: "3 retry attempts failed for '{task.title}'. All attempts documented above."
options:
  - label: "Provide hint (Recommended)"
    description: "Give me guidance to try a 4th approach"
  - label: "Take over task"
    description: "User will complete this task manually"
  - label: "Void contract"
    description: "Cancel entire change - this is a fundamental blocker"
```

**NOTE:** "Skip task" is NOT an option. The task must be completed, taken over by user, or the entire contract voided.

---

## Phase 2: TDD Work Loop (with Retry)

Same as `/adv-apply` but with retry on verification failures.

### ⚠️ Anti-Patterns (PROHIBITED)

These behaviors violate the autonomous retry protocol:

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

**If you recognize yourself doing any of these:** STOP. Re-read the retry protocol. Your purpose is autonomous completion.

### Task Flow

```
adv_task_ready change_id: <id>
```

For each ready task:

1. **Start**: `adv_task_update status: "in_progress"`
2. **Red Phase**: Write failing test
3. **Green Phase**: Implement → verify → **retry if fails**
4. **Complete**: `adv_task_update status: "done"` (only after verification passes)

**REMINDER:** A task is not complete until verification passes. "Done" means DONE.

### Incremental Verification

After EACH task:
1. Run verification (build, tests, lint)
2. If fails: Apply Autonomous Retry Protocol
3. Only mark complete after pass

---

## Phase 3: Global Final Loop

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
1. Apply Autonomous Retry Protocol
2. Continue until all pass OR budget exhausted

---

## Phase 4: Completion

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
  {if status != "done"} ⚠️ INCOMPLETE - CANNOT FULFILL CONTRACT
{end}

SKIP/DEFER CHECK:
- [ ] No tasks were skipped
- [ ] No tasks marked "blocked" without 3 retry attempts
- [ ] No tasks deferred "for later"
- [ ] All "trivial" task skips have documented rationale

============================================================
```

**If ANY task is incomplete without proper documentation, you CANNOT proceed to CONTRACT FULFILLED.**

### Contract Fulfilled Banner

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: {title}

ALL CRITERIA MET:
- [x] (C1) {criterion}
- [x] (C5) Global Final Loop - PASSED

COMPLETION MODE:
{one of}
- FULLY AUTONOMOUS - All tasks completed without human intervention
- GUIDED - {N} tasks required user hints
- PARTIAL TAKEOVER - {N} tasks completed by user

============================================================
```

### Completion Banner

```
============================================================
      /adv-ralph {change-id} COMPLETE
============================================================
Result: CONTRACT FULFILLED (autonomous retry enabled)
Completion: {FULLY AUTONOMOUS | GUIDED | PARTIAL TAKEOVER}
Tasks: {completed}/{total}
============================================================
```

**Completion mode definitions:**
- **FULLY AUTONOMOUS**: All tasks done by agent, no hints needed
- **GUIDED**: Agent completed all tasks but needed user hints for some
- **PARTIAL TAKEOVER**: User manually completed some tasks

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Ready tasks | `adv_task_ready` |
| Update task | `adv_task_update` |
| Validate | `adv_change_validate` |
