---
name: adv-ralph
description: Implement change with autonomous retry on failures - extends adv-apply with retry protocol
agent: build
---

# ADV Ralph - Autonomous Implementation with Retry

Implement an ADV change with **autonomous retry enabled**. This extends `/adv-apply` with automatic error diagnosis and retry on failures.

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

ATTEMPTS:
1. {first fix description}
2. {second fix description}
3. {third fix description}

PERSISTENT ERROR:
{error message}

ANALYSIS:
{why you're stuck}

REQUESTING GUIDANCE:
- Provide a hint
- Take over manually
- Void contract

============================================================
```

Then `mcp_question`:
```
header: "Stuck"
question: "Retry budget exhausted. How to proceed?"
options:
  - label: "Provide guidance"
  - label: "Skip task"
  - label: "Void contract"
```

---

## Phase 2: TDD Work Loop (with Retry)

Same as `/adv-apply` but with retry on verification failures.

### Task Flow

```
adv_task_ready change_id: <id>
```

For each ready task:

1. **Start**: `adv_task_update status: "in_progress"`
2. **Red Phase**: Write failing test
3. **Green Phase**: Implement → verify → **retry if fails**
4. **Complete**: `adv_task_update status: "done"` (only after verification passes)

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

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: {title}

ALL CRITERIA MET:
- [x] (C1) {criterion}
- [x] (C5) Global Final Loop - PASSED

============================================================
```

### Completion Banner

```
============================================================
      /adv-ralph {change-id} COMPLETE
============================================================
Result: CONTRACT FULFILLED (autonomous retry enabled)
============================================================
```

**If human guidance needed:**
```
Result: CONTRACT FULFILLED (with human guidance on N issues)
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Ready tasks | `adv_task_ready` |
| Update task | `adv_task_update` |
| Validate | `adv_change_validate` |
