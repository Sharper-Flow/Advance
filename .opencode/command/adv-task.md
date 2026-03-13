---
name: adv-task
description: Fast-track a discussed change: synthesize contract, validate best practices, prep, and hand off
agent: general
---

# ADV Task — Fast-Track a Discussed Change

Synthesize a contract from the current conversation, validate best practices, prep tasks, and hand off to Build.

Use this when you and the user have already agreed on what needs to be done and want to skip the heavyweight proposal phase.

**Pipeline:**
1. Synthesize a **Quick Contract** from the conversation
2. Confirm with the user (chat-based, no file review required)
3. Create a standard ADV change (camelCase ID, `tk-` tasks)
4. **Research** — validate LBP targets via Context7 (halt if major conflict found)
5. **Prep** — generate `tk-` tasks automatically
6. **Hand off** — stop and prompt user to switch to Build agent for `/adv-apply`

<UserRequest>
  $ARGUMENTS
</UserRequest>

---

## Argument Handling

`$ARGUMENTS` is **always optional**. `/adv-task` is designed to be invoked with no arguments — the agent derives everything it needs from the recent conversation.

| Invocation | Behaviour |
|------------|-----------|
| `/adv-task` (no args) | Synthesize contract entirely from recent conversation. Derive a title from the topic discussed. |
| `/adv-task <hint>` | Use the hint to anchor the contract (e.g. `/adv-task fix login timeout`). Fill remaining details from conversation. |

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
  proposal.md written to change directory after confirmation

============================================================
```

### Contract Confirmation

Use the `question` tool:

```json
{
  "questions": [{
    "header": "Quick Contract",
    "question": "Does this Quick Contract accurately capture what we discussed? Confirming will kick off Research → Prep → hand off to Build.",
    "options": [
      { "label": "Confirmed — execute (Recommended)", "description": "Proceed with research and prep" },
      { "label": "Modify contract", "description": "I want to adjust the intent, scope, or LBP targets" },
      { "label": "Abort", "description": "Cancel — do not create a change" },
      { "label": "Other", "description": "Use custom text area for a different contract decision" }
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
adv_change_create summary: "{2-5 word summary}" capability: "{primary capability if applicable}" proposal: "{full proposal.md markdown from template below}"
```

Capture the returned `changeId`.

**Persist `proposal.md` via tool call only** — include the fully rendered proposal markdown in the `proposal` argument to `adv_change_create`. Do not use direct filesystem writes (`Write`, `Edit`, `bash`, `/tmp` staging, or manual JSON edits) for proposal/change artifacts.

Use this template:

```markdown
# {change title}

## Intent

{contract intent — 1-3 sentences}

## LBP Targets

{list of LBP targets from the contract}

## Scope

{list of files/modules expected to change}

## Success Criteria

{list of measurable criteria from the contract}
```

Emit:

```
[ADV:ROCKET]
Quick Contract confirmed. Change created: {changeId}
proposal.md persisted by adv_change_create
Pipeline: Research → Prep → hand off to Build
```

---

## Phase 2: Research — LBP Validation (Orchestrated)

Emit `[ADV:ROCKET]` — Research phase starting.

LBP validation uses the same orchestrator pattern as `/adv-research`: spawn sub-agents for parallel documentation lookup and architecture validation, then synthesize results inline.

### Step 2.1: Load Project Context

```
adv_project_context
```

### Step 2.2: Spawn Research Sub-Agents

**Spawn 1-2 sub-agents in a SINGLE message for parallel execution.**

Split LBP targets by agent specialty:

| LBP Target Type | Agent | Examples |
|-----------------|-------|----------|
| Library/API usage | `librarian` | "Is Zod the right choice?", "fetch vs axios" |
| Architecture/pattern | `adv-researcher` | "Is this the right pattern?", "Could this be simpler?" |
| Both | Both | Librarian finds docs, Researcher validates |

**Skip `adv-researcher`** if all LBP targets are purely library/API questions with no architectural dimension.

#### Librarian Sub-Agent Template

```
Validate best practices for the following LBP targets:

PROJECT CONTEXT:
{full content from adv_project_context}

LBP TARGETS TO VALIDATE:
{for each library/API LBP target}
- {target}: {what was proposed}
{end}

For each target, return:
- What the official docs recommend (with source URL)
- Whether the proposed approach aligns
- Verdict: CONFIRMED / CAUTION / CONFLICT

Return structured findings with sources.
```

#### adv-researcher Sub-Agent Template

When using `adv-researcher` agent, the system prompt already contains behavioral instructions. Only pass task-specific context:

```
RESEARCH QUESTION: Validate architectural decisions for this change

PROJECT TECH STACK:
{full content from adv_project_context}

LBP TARGETS TO VALIDATE:
{for each architecture/pattern LBP target}
- {target}: {what was proposed}
{end}

CONTEXT:
{contract intent and scope}

Evaluate each target against canonical best practices for this tech stack.
```

#### Fallback

If sub-agents fail or time out, fall back to inline Context7 lookups:
```
context7_resolve-library-id libraryName: "{library}"
context7_query-docs libraryId: "{id}" query: "{question}"
```

If Context7 has no result, fall back to `kagi_search_fetch`.

### Step 2.3: Synthesize Verdicts

After sub-agents return, synthesize a verdict for each LBP target:

| Target | Finding | Verdict |
|--------|---------|---------|
| {approach} | {what the docs/community say} | ✅ Confirmed / ⚠️ Caution / ❌ Conflict |

**Verdict rules:**
- ✅ **Confirmed**: Approach aligns with current official recommendations
- ⚠️ **Caution**: Approach works but there is a preferred alternative; surface to user but continue
- ❌ **Conflict**: Official docs or community consensus explicitly advises against this approach

### Step 2.4: LBP Halt Condition

**If ANY LBP target has a ❌ Conflict verdict**, STOP the pipeline and use the `question` tool:

```json
{
  "questions": [{
    "header": "LBP Conflict Detected",
    "question": "Research found a best-practice conflict:\n\n{LBP target}: {what was proposed}\nConflict: {what the docs say}\nRecommended instead: {alternative}\n\nHow should we proceed?",
    "options": [
      { "label": "Adopt the recommended approach", "description": "Update the contract to use the LBP-recommended alternative, then continue" },
      { "label": "Keep original approach", "description": "Proceed with the originally proposed approach despite the conflict" },
      { "label": "Abort contract", "description": "Cancel — rethink the design before executing" },
      { "label": "Other", "description": "Use custom text area for a different conflict resolution" }
    ]
  }]
}
```

- **Adopt recommended**: Update the LBP target in your working contract, continue pipeline
- **Keep original**: Note the deviation in the first task's description, continue pipeline
- **Abort**: Stop. Do not proceed.

### Step 2.5: Complete Research Gate

After all LBP targets are validated (or conflicts resolved):

```
adv_gate_complete changeId: {changeId} gateId: research completedBy: "adv-task LBP validation: {summary of findings}"
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
adv_gate_complete changeId: {changeId} gateId: prep completedBy: "adv-task auto-prep: {N} tasks generated"
```

---

## Phase 4: Build Handoff

Emit the completion summary and stop. Do NOT begin implementation.

```
============================================================
         /adv-task READY FOR BUILD
============================================================

CHANGE: {changeId}
INTENT: {contract intent}

LBP VALIDATION:
{table of targets and verdicts}

TASKS READY: {total}
{for each task}
  - [{task.id}] {task.title}
{end}

GATES:
  research      ✓
  prep          ✓
  implementation  pending
  review          pending
  harden          pending
  signoff         pending

------------------------------------------------------------
  ⚡ Recommended next step (Build agent):
     /adv-apply {changeId}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Create change | `adv_change_create` |
| Spawn LBP research | Task tool (librarian, adv-researcher) |
| LBP fallback | `context7_resolve-library-id`, `context7_query-docs`, `kagi_search_fetch` |
| Project context | `adv_project_context` |
| Check conflicts | `adv_change_list` |
| Add tasks | `adv_task_add` |
| Complete gates | `adv_gate_complete` |
