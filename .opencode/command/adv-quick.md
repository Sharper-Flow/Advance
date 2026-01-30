---
name: adv-quick
description: Create a contract and START IMMEDIATELY - infers criteria, confirms, then begins work
---

# /adv-quick - Start Working Now

For when you want to **start working immediately** with a lightweight contract. Parse the request, infer success criteria, get confirmation, and begin implementation right away.

**Key behavior**: Adds task to **top of agenda** and starts immediately after confirmation.

**Use this for:**
- Quick features that don't need spec-level formality
- Bug fixes with clear acceptance criteria
- Refactoring tasks
- Technical improvements
- Anything you want done NOW

**vs /adv-task**: Use `/adv-task` to queue work for later without starting. `/adv-quick` starts immediately.

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

Emit `[ADV:MIC]` and use the `question` tool:

```json
{
  "questions": [{
    "header": "Confirm Contract",
    "question": "Does this capture your requirements?",
    "options": [
      { "label": "Accept and begin (Recommended)", "description": "Lock the contract and start implementation" },
      { "label": "Suggest changes", "description": "Modify criteria before locking" },
      { "label": "Cancel", "description": "Discard this contract" }
    ]
  }]
}
```

### Step 5: On Acceptance - Quick Prep Analysis

Before starting implementation, perform a **lightweight prep analysis** (30-60 seconds):

#### 5.1 Codebase Impact Scan

Quick search for files that might be affected:
```
- Search for key terms from the task (function names, modules, etc.)
- Identify 2-5 files likely to be modified
- Note any existing similar patterns to follow
```

#### 5.2 Cross-Cutting Concerns Check

Run through this checklist mentally (add criteria if gaps found):

| Concern | Question | If Yes → Add Criterion |
|---------|----------|------------------------|
| Error Handling | Will this need error cases? | "Error cases return appropriate status" |
| Logging | Should this log actions? | "Appropriate logging added" |
| Security | Auth/validation needed? | "Input validated / auth checked" |
| Config | New config options? | "Config documented" |
| Performance | Latency-sensitive? | "No performance regression" |

#### 5.3 Library Check (if applicable)

If task mentions a library/framework:
- Quick Context7 lookup: `resolve-library-id` → `query-docs`
- Verify the approach aligns with library best practices
- Note any simpler built-in alternatives

#### 5.4 Conflict Check

```
adv_change_list
```
- If active changes touch same area, warn user
- Consider if this should wait or be coordinated

---

### Step 6: Create and Start

1. **Create agenda item** using `adv_agenda_add`:
   - `title`: The objective
   - `description`: Full criteria list (markdown formatted)
   - `priority`: critical (goes to top of queue)
   - `category`: Inferred task type

2. **Start the task** using `adv_agenda_start`

3. **Output locked contract with prep findings**:

```
============================================================
                CONTRACT LOCKED
============================================================
Agenda ID: <ag-xxxxxxxx>
Status: in_progress

PREP ANALYSIS:
- Files to modify: <list of 2-5 files>
- Cross-cutting: <any added criteria>
- Conflicts: <none | warning about active changes>

Beginning implementation...
============================================================
```

4. **Begin implementation immediately** - don't wait for another user message

### Step 7: On "Suggest Changes"

Ask what they'd like to modify, adjust the contract, and re-present for confirmation.

### Step 8: On "Cancel"

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

#### Lightweight Gate Completion

For agenda items, complete gates in expedited fashion:

1. **Research gate** (if not already done):
   - Quick Context7 lookup for any libraries/frameworks used
   - Mark with `adv_agenda_evidence` or note "trivial: no external libs"

2. **Prep gate** (if not already done):
   - Files already scanned in Step 5
   - Mark complete with scan results as evidence

3. **Implementation gate**:
   - All criteria verified = implementation complete

4. **Review gate** (expedited):
   - Quick self-review: any obvious issues?
   - Check: no security holes, no broken tests, code readable
   - Mark complete with "self-review: passed" or note issues

5. **Harden gate** (expedited):
   - Quick check: no debug code left, no console.logs in production paths
   - Mark complete with "quick-harden: passed"

6. **Signoff gate**:
   - User confirmation via completion prompt (below)

#### Complete Agenda Item

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

GATES (expedited):
- [x] Research: {evidence}
- [x] Prep: {evidence}
- [x] Implementation: criteria verified
- [x] Review: self-review passed
- [x] Harden: quick-harden passed
- [x] Signoff: user confirmed

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
