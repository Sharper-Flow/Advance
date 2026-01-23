---
name: adv-quick
description: Quickly create a contract by inferring criteria from your request and begin implementation
---

# /adv-quick - Rapid Contract Creation

For when you want a lightweight contract without the full spec/change workflow. Parse the user's request, create an agenda item with success criteria, and begin implementation after confirmation.

**Use this for:**
- Quick features that don't need spec-level formality
- Bug fixes with clear acceptance criteria
- Refactoring tasks
- Technical improvements

**Use `/adv-change` instead for:**
- Features that affect existing specs
- Breaking changes
- Work that needs formal requirements documentation

---

## Pre-flight Check

If `$ARGUMENTS` is empty or whitespace:
```
Usage: /adv-quick <task description>

Examples:
  /adv-quick Add JWT auth without breaking existing routes
  /adv-quick Fix the login timeout bug that happens after 30 seconds
  /adv-quick Refactor database module to use connection pooling

For spec-driven changes, use /adv-change instead.
```
Then stop execution.

---

## Process

### Step 1: Parse the Request

Analyze `$ARGUMENTS` for:
- **Implicit objective**: What they want done
- **Implicit success criteria**: What "done" looks like (verifiable yes/no)
- **Implicit constraints**: Things they care about preserving
- **Task type**: feature | bugfix | refactor | test | debt

### Step 2: Infer Success Criteria

**For feature requests**, infer criteria like:
- Feature works as described
- Existing functionality preserved
- Tests included (if project has tests)
- No type errors (if TypeScript/typed language)

**For bug fixes**, infer criteria like:
- Bug no longer reproduces
- Root cause identified and fixed (not just symptoms)
- Regression test added
- No new bugs introduced

**For refactoring**, infer criteria like:
- All existing tests pass
- Behavior unchanged
- Code meets stated improvement goal
- No new warnings/errors

**For tests**, infer criteria like:
- Tests cover the stated functionality
- Tests are deterministic (no flakiness)
- Tests follow project conventions
- All tests pass

### Step 3: Generate Contract

Create the contract format:

```
============================================================
                  QUICK CONTRACT
============================================================

OBJECTIVE: <one sentence definition of done>

SUCCESS CRITERIA:
- [ ] (C1) <first criterion - verifiable>
- [ ] (C2) <second criterion - verifiable>
- [ ] (C3) <third criterion - verifiable>
...

CONSTRAINTS:
- MUST NOT: <things to preserve/avoid breaking>
- MUST: <non-negotiables>

TDD APPROACH: <Required | Recommended | Not required>
  <brief rationale>

============================================================
```

### Step 4: Request Confirmation

Emit `[GOOST:MIC]` and use `mcp_question`:

```
mcp_question:
  header: "Confirm Contract"
  question: "Does this capture your requirements?"
  options:
    - label: "Accept and begin (Recommended)"
      description: "Lock the contract and start implementation"
    - label: "Suggest changes"
      description: "Modify criteria before locking"
    - label: "Cancel"
      description: "Discard this contract"
```

### Step 5: On Acceptance

1. **Create agenda item** using `adv_agenda_add`:
   - `title`: The objective
   - `description`: Full criteria list (markdown formatted)
   - `priority`: Infer from request (urgent language = high, etc.)
   - `category`: Inferred task type

2. **Start the task** using `adv_agenda_start`

3. **Output locked contract**:

```
============================================================
                CONTRACT LOCKED
============================================================
Agenda ID: <ag-xxxxxxxx>
Status: in_progress

Beginning implementation...
============================================================
```

4. **Begin implementation immediately** - don't wait for another user message

### Step 6: On "Suggest Changes"

Ask what they'd like to modify, adjust the contract, and re-present for confirmation.

### Step 7: On "Cancel"

```
Contract cancelled. No agenda item created.

To try again: /adv-quick <description>
For full spec workflow: /adv-change <summary>
```

---

## During Implementation

### Status Updates

Every response during implementation should end with:

```
---
CONTRACT STATUS: <ag-xxxxxxxx>
- [x] (C1) <criterion> (evidence: <how verified>)
- [ ] (C2) <criterion> (in progress)
- [ ] (C3) <criterion> (pending)
Progress: X/Y criteria complete
---
```

### TDD Workflow

If TDD is required/recommended:

1. **RED Phase**: Write failing test first
   - Record with `adv_agenda_evidence`
   
2. **GREEN Phase**: Implement to pass
   - Record with `adv_agenda_evidence`
   
3. **Continue** for each criterion

### Completion

When ALL criteria are verified:

1. **Complete the agenda item** using `adv_agenda_complete` with notes summarizing what was done

2. **Output completion**:

```
============================================================
                CONTRACT FULFILLED
============================================================
Agenda ID: <ag-xxxxxxxx>
Objective: <objective>

ALL CRITERIA MET:
- [x] (C1) <criterion> (evidence: ...)
- [x] (C2) <criterion> (evidence: ...)
- [x] (C3) <criterion> (evidence: ...)

Duration: ~X minutes
============================================================
```

---

## When to Fall Back

If the request is:
- **Ambiguous**: Could mean multiple things
- **Very complex**: Needs >6 criteria
- **Spec-affecting**: Changes existing requirements

Say:
```
This request is complex enough to benefit from the full spec workflow.

Recommendation: Use /adv-change <summary> to create a proper change
with spec deltas and formal task breakdown.
```

---

## Examples

### Feature Request
```
/adv-quick Add rate limiting to the API - 100 requests per minute per user
```

Inferred contract:
- (C1) Rate limiter middleware implemented
- (C2) Requests beyond 100/min return 429 status
- (C3) Rate limit is per-user (identified by auth token)
- (C4) Existing endpoints continue to work
- MUST NOT: Break existing auth flow

### Bug Fix
```
/adv-quick Fix the memory leak in WebSocket connections
```

Inferred contract:
- (C1) Memory leak identified and root cause documented
- (C2) Fix implemented that prevents leak
- (C3) Memory usage stable over extended connection test
- (C4) Regression test added
- MUST NOT: Break WebSocket functionality

### Refactor
```
/adv-quick Refactor user service to use repository pattern
```

Inferred contract:
- (C1) UserRepository interface created
- (C2) User service uses repository instead of direct DB calls
- (C3) All existing tests pass
- (C4) No behavior changes (same API contract)
- TDD: Not required (refactor with existing tests)

---

## Completion Banner

```
============================================================
      /adv-quick COMPLETE
============================================================
Result: CONTRACT FULFILLED
Agenda: <ag-xxxxxxxx> marked complete
============================================================
```

**If voided/cancelled:**
```
============================================================
      /adv-quick COMPLETE  
============================================================
Result: CONTRACT VOIDED - X of Y criteria completed
Reason: <user requested | blocked | other>
============================================================
```
