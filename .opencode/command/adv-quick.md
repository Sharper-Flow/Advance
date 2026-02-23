---
name: adv-quick
description: Fast-track a pre-discussed change — synthesize a chat contract, confirm with the user, then autonomously research, prep, and implement.
agent: build
---

# ADV Quick - Fast-Track Contract Execution

Turn a pre-discussed change into a fully-executed ADV change **without the heavyweight proposal phase**.

Use this when you and the user have already agreed on what needs to be done in conversation and just want to formalize, validate best practices, and execute autonomously.

**Pipeline:**
1. Synthesize a **Quick Contract** from the conversation
2. Confirm with the user (chat-based, no file review required)
3. Create a standard ADV change (camelCase ID, `tk-` tasks)
4. **Research** — validate LBP targets via Context7 (halt if major conflict found)
5. **Prep** — generate `tk-` tasks automatically
6. **Implement** — execute autonomously with TDD (full `/adv-apply` behavior)

<UserRequest>
  $ARGUMENTS
</UserRequest>

---

## ⛔ CRITICAL: NO SKIP / NO DEFER POLICY

Same as `/adv-apply`. Once the contract is confirmed, every task MUST be completed.

- ❌ Skip tasks "to revisit later"
- ❌ Defer tasks "until more information is available"
- ❌ Mark tasks as blocked without exhausting ALL retry attempts
- ❌ Cancel tasks via `adv_task_update` (use `adv_task_cancel` with user approval)

**Cross-repo tasks MUST be executed in the target repo.** "Different repo" is NOT a valid reason to cancel.

---

## Argument Handling

`$ARGUMENTS` is **always optional**. `/adv-quick` is designed to be invoked with no arguments — the agent derives everything it needs from the recent conversation.

| Invocation | Behaviour |
|------------|-----------|
| `/adv-quick` (no args) | Synthesize contract entirely from recent conversation. Derive a title from the topic discussed. |
| `/adv-quick <hint>` | Use the hint to anchor the contract (e.g. `/adv-quick fix login timeout`). Fill remaining details from conversation. |

**Never ask the user "what do you want to work on?" when `$ARGUMENTS` is empty.** The assumption is always: *the user is referring to whatever was just discussed.* If the conversation contains no clear prior discussion of a change, synthesize a contract from the most recent topic and let the confirmation step (question tool) surface any corrections.

---

## Phase 0: Synthesize the Quick Contract

Read the recent conversation history and extract the agreed-upon change. If `$ARGUMENTS` is provided, use it as an anchor; otherwise derive everything from context.

Emit this block in the chat:

```
============================================================
              QUICK CONTRACT
============================================================

INTENT
  {1-3 sentences describing what will be built or fixed}

LBP TARGETS (to be validated before implementation)
  {List the specific architectural decisions, library choices, or
   patterns proposed in the conversation that require LBP validation.
   Example: "Use Zod for runtime validation", "Prefer fetch over axios",
   "Store session in cookie vs localStorage"}
  - {LBP target 1}
  - {LBP target 2}
  ...

SCOPE
  Files / modules expected to change:
  - {file or module}
  - {file or module}

SUCCESS CRITERIA
  - [ ] {measurable criterion 1}
  - [ ] {measurable criterion 2}
  - [ ] All tasks completed with passing tests

CONTRACT STORAGE
  Summary stored in change.json (no proposal.md generated)

============================================================
```

### Contract Confirmation

Use the `question` tool:

```json
{
  "questions": [{
    "header": "Quick Contract",
    "question": "Does this Quick Contract accurately capture what we discussed? Confirming will kick off autonomous Research → Prep → Implement.",
    "options": [
      { "label": "Confirmed — execute (Recommended)", "description": "Proceed with research and implementation" },
      { "label": "Modify contract", "description": "I want to adjust the intent, scope, or LBP targets" },
      { "label": "Abort", "description": "Cancel — do not create a change" }
    ]
  }]
}
```

**If "Modify contract"**: Re-synthesize from user corrections, re-show the Quick Contract, re-confirm.

**If "Abort"**: Stop. Do not create a change.

**If "Confirmed"**: Proceed to Phase 1.

---

## Phase 1: Create the Change

Call `adv_change_create` with a 2-5 word action-verb summary derived from the contract intent.

```
adv_change_create summary: "{2-5 word summary}" capability: "{primary capability if applicable}"
```

Capture the returned `changeId`.

**Store the Quick Contract in the change:** The full contract text (intent, LBP targets, scope, success criteria) becomes the `title` field naturally via the summary, and is recorded in the agent's working context. No `proposal.md` is written — the contract lives in the conversation and the change's task descriptions will capture implementation detail.

Emit:

```
[ADV:ROCKET]
Quick Contract confirmed. Change created: {changeId}
Pipeline: Research → Prep → Implement (autonomous)
```

---

## Phase 2: Research — LBP Validation

Emit `[ADV:ROCKET]` — Research phase starting.

For **each LBP target** from the contract:

### Step 2.1: Resolve Library / Pattern

Use Context7 to validate the proposed approach:

```
context7_resolve-library-id libraryName: "{library or framework name}"
```

Then query for current best practice:

```
context7_query-docs libraryId: "{id}" query: "{specific question about the proposed usage}"
```

If Context7 has no result, fall back to `kagi_search_fetch` for current community guidance.

### Step 2.2: Evaluate Against LBP

For each LBP target, record:

| Target | Finding | Verdict |
|--------|---------|---------|
| {approach} | {what the docs/community say} | ✅ Confirmed / ⚠️ Caution / ❌ Conflict |

**Verdict rules:**
- ✅ **Confirmed**: Approach aligns with current official recommendations
- ⚠️ **Caution**: Approach works but there is a preferred alternative; surface to user but continue
- ❌ **Conflict**: Official docs or community consensus explicitly advises against this approach

### Step 2.3: LBP Halt Condition

**If ANY LBP target has a ❌ Conflict verdict**, STOP the pipeline and use the `question` tool:

```json
{
  "questions": [{
    "header": "LBP Conflict Detected",
    "question": "Research found a best-practice conflict:\n\n{LBP target}: {what was proposed}\nConflict: {what the docs say}\nRecommended instead: {alternative}\n\nHow should we proceed?",
    "options": [
      { "label": "Adopt the recommended approach", "description": "Update the contract to use the LBP-recommended alternative, then continue" },
      { "label": "Keep original approach", "description": "Proceed with the originally proposed approach despite the conflict" },
      { "label": "Abort contract", "description": "Cancel — rethink the design before executing" }
    ]
  }]
}
```

- **Adopt recommended**: Update the LBP target in your working contract, continue pipeline
- **Keep original**: Note the deviation in the first task's description, continue pipeline
- **Abort**: Stop. Do not proceed with implementation.

### Step 2.4: Complete Research Gate

After all LBP targets are validated (or conflicts resolved):

```
adv_gate_complete changeId: {changeId} gateId: research completedBy: "adv-quick LBP validation: {summary of findings}"
```

Emit research summary:

```
[ADV:ROCKET]
Research complete for {changeId}:
{table of LBP targets and verdicts}

Proceeding to Prep...
```

---

## Phase 3: Prep — Generate Tasks

Emit `[ADV:ROCKET]` — Prep phase starting.

### Step 3.1: Load Project Context

```
adv_project_context
```

### Step 3.2: Scan the Codebase

Read the files identified in the contract scope. For each:
- Understand the current implementation
- Note patterns to follow (naming, structure, error handling)
- Identify dependencies

### Step 3.3: Check for Conflicts

```
adv_change_list
```

Check if any active changes touch the same files or capabilities. If conflicts found, note them in task descriptions.

### Step 3.4: Generate Tasks via `adv_task_add`

Decompose the contract into atomic `tk-` tasks. Each task should:
- Be implementable in a single work session
- Have a clear, testable success condition
- Include TDD guidance in the description (logic-heavy → TDD required; trivial → note skip reason)

Task ordering rules:
- Add tasks in dependency order (blockers first)
- Use `blockedBy` to declare ordering

Example task add calls:

```
adv_task_add changeId: {changeId} content: "Write failing test for {component}: {specific behavior}" section: "Testing"
adv_task_add changeId: {changeId} content: "Implement {component} — {specific deliverable}" section: "Implementation" blockedBy: ["tk-{test-task-id}"]
```

Generate at minimum:
- At least one test task per logical unit of behavior
- One implementation task per test task
- Any migration, config, or cleanup tasks surfaced during scan

### Step 3.5: Complete Prep Gate

```
adv_gate_complete changeId: {changeId} gateId: prep completedBy: "adv-quick auto-prep: {N} tasks generated"
```

Emit:

```
[ADV:ROCKET]
Prep complete for {changeId}: {N} tasks generated
Tasks:
{for each task}
  - {task.id}: {task.title}
{end}

Proceeding to Implementation...
```

---

## Phase 4: Implement — Autonomous Execution

This phase is **identical to `/adv-apply`** Phase 0 (worktree assessment) through Phase 6 (completion).

Emit:

```
[ADV:ROCKET]
Entering autonomous implementation for {changeId}
Retry protocol: ENABLED
```

### Worktree Assessment

Apply the same worktree logic as `/adv-apply` Phase 0:

| Signal | Risk Level |
|--------|------------|
| 3+ files affected | High — suggest worktree |
| Breaking API changes | High — suggest worktree |
| Risky refactor | High — suggest worktree |
| 1-2 files, trivial changes only | Low — skip worktree |

Check `worktree_create` availability. If unavailable, emit `[ADV:INFO]` and proceed in-place.

If risk is High, ask via `question` tool (see `/adv-apply` Phase 0 for exact format).

### TDD Work Loop

Follow `/adv-apply` Phase 3 exactly:

1. **Get ready tasks**: `adv_task_ready changeId: {changeId}`
2. **For each task**:
   a. Refresh context: `adv_change_show changeId: {changeId}`
   b. Mark in progress: `adv_task_update taskId: {id} status: "in_progress"`
   c. **Red phase**: Write failing test, record with `adv_task_evidence phase: "red"`
   d. **Green phase**: Implement, run tests, record with `adv_task_evidence phase: "green"`
   e. **Retry on failure**: Apply autonomous retry protocol (3 attempts, classified diagnosis)
   f. Mark done: `adv_task_update taskId: {id} status: "done"`
3. Repeat until `adv_task_ready` returns empty

### Retry Protocol

Same as `/adv-apply`:
- **SEMANTIC** errors: 3 retries with distinct diagnosis each time
- **TRANSIENT** errors: 1 retry after 5s delay
- **ENVIRONMENTAL** errors: Immediate escalation to user

### Global Final Loop

After all tasks complete, run full verification:
- Full build
- All tests
- No lint errors
- No type errors

If any fail, apply retry protocol before marking implementation gate.

### Complete Implementation Gate

```
adv_gate_complete changeId: {changeId} gateId: implementation completedBy: "adv-quick autonomous execution"
```

---

## Phase 5: Completion Banner

```
============================================================
           /adv-quick CONTRACT FULFILLED
============================================================

CHANGE: {changeId}
INTENT: {contract intent}

LBP VALIDATION:
{table of targets and verdicts}

TASKS COMPLETED: {done}/{total}
  {for each task}
  - [{task.id}] {task.title}
  {end}

COMPLETION MODE: {FULLY AUTONOMOUS | GUIDED | PARTIAL TAKEOVER}

GATES:
  research      ✓
  prep          ✓
  implementation ✓
  review        pending → run /adv-review {changeId}
  harden        pending → run /adv-harden {changeId}
  signoff       pending

NEXT STEPS:
  /adv-review {changeId}    Code review (correctness, security, architecture)
  /adv-harden {changeId}    AI-slop detection, test coverage, doc hygiene

============================================================
```

---

## TodoWrite Rules

Same as `/adv-apply`: use task IDs only in the todo list (e.g., `tk-abc123`), not descriptions. Forces context lookup via `adv_change_show` before each task.

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Create change | `adv_change_create` |
| LBP research | `context7_resolve-library-id`, `context7_query-docs`, `kagi_search_fetch` |
| Project context | `adv_project_context` |
| Add tasks | `adv_task_add` |
| Complete gates | `adv_gate_complete` |
| Get ready tasks | `adv_task_ready` |
| Refresh context | `adv_change_show` |
| Update task | `adv_task_update` |
| Record TDD evidence | `adv_task_evidence` |
| Cancel tasks | `adv_task_cancel` (user approval required) |
| Validate | `adv_change_validate` |
