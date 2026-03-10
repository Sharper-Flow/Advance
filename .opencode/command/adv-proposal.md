---
name: adv-proposal
description: Propose a new change with problem statement agreement then full proposal
agent: build
---

# ADV Proposal — Create Change with Quality Requirements

Create a new change proposal. Uses a two-phase workflow: first establish shared understanding of the problem (Phase 1), then build the full proposal with INVEST criteria and requirements smell detection (Phase 2).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Pre-flight Checks

### Step 1: Resolve Summary

`$ARGUMENTS` is **optional**. The agent always has enough context to proceed.

| Invocation | Behaviour |
|------------|-----------|
| `/adv-proposal` (no args) | Derive a concise 2-5 word summary from the recent conversation. Never ask the user "what do you want to build?" — synthesize from context and let the question tool confirm scope. |
| `/adv-proposal <summary>` | Use the provided text as the change summary verbatim. |

**Never stop execution or print a usage error when `$ARGUMENTS` is empty.** If the conversation contains no clear prior topic, pick a reasonable working title (e.g. "explore new feature") — the user will refine it via the Phase 1 confirmation.

### Step 2: Check for Existing Changes

Call `adv_change_list` to check for active changes.

**If similar change exists:**
- Use the `question` tool:
  ```json
  {
    "questions": [{
      "header": "Similar Change",
      "question": "Found similar active change '<change-id>'. Continue anyway?",
      "options": [
        { "label": "Create new (Recommended)", "description": "Create a separate change proposal" },
        { "label": "Show existing", "description": "View the existing change instead" },
        { "label": "Cancel", "description": "Do not create" },
        { "label": "Other", "description": "Use custom text area for a different action" }
      ]
    }]
  }
  ```

### Step 3: Check for Brainstorm Context

Look for `./temp/brainstorm-*.md` files that might provide context.

**If found:**
- Read the brainstorm document
- Use decisions and findings to inform the proposal
- Reference in proposal.md

---

## Phase 1: Problem Statement Agreement

**Purpose:** Establish shared understanding of the problem before creating any change artifacts. This is the first context agreement between the user and the agent. No change scaffold is created until the user confirms.

### Synthesize Problem Statement

Read the recent conversation history and `$ARGUMENTS`. Synthesize a brief problem statement block covering:

- **Problem:** What is broken, missing, or suboptimal? (1-3 sentences)
- **Desired Outcome:** What does success look like? (1-2 sentences)
- **Scope:** Which files, modules, or subsystems are affected? (bullet list)

Emit this block in the chat:

```
============================================================
              PROBLEM STATEMENT
============================================================

PROBLEM
  {1-3 sentences describing what is broken, missing, or suboptimal}

DESIRED OUTCOME
  {1-2 sentences describing what success looks like}

SCOPE
  Files / modules expected to change:
  - {file or module}
  - {file or module}

============================================================
```

### Problem Statement Confirmation

Use the `question` tool:

```json
{
  "questions": [{
    "header": "Problem Statement",
    "question": "Does this problem statement accurately capture what we're building?",
    "options": [
      { "label": "Confirmed — proceed (Recommended)", "description": "Create the change and continue with the full proposal" },
      { "label": "Adjust statement", "description": "I want to refine the problem statement before proceeding" },
      { "label": "Abort", "description": "Cancel — do not create a change" }
    ]
  }]
}
```

**If "Adjust statement"**: Re-synthesize from user corrections, re-show the Problem Statement block, re-confirm. Repeat until confirmed or aborted.

**If "Abort"**: Stop execution. Do NOT create any change artifacts.

**If "Confirmed"**: Proceed to Phase 2. The confirmed problem statement text will be persisted as the `## Why` section of `proposal.md` via the `proposal` parameter in `adv_change_create`.

---

## Phase 2: Full Proposal

### Step 4: Create Change Scaffold

**Only reached after Phase 1 confirmation.** Build the initial proposal content from the confirmed problem statement:

```markdown
# <resolved summary>

## Why

<confirmed problem statement text from Phase 1>

## What Changes

<!-- To be filled in this phase -->

## Success Criteria

<!-- To be filled in this phase -->
```

Call `adv_change_create summary: "<resolved summary from Step 1>" proposal: "<initial proposal content above>"`

This will create:
- `changes/<change-id>/change.json` - Change metadata
- `changes/<change-id>/proposal.md` - Proposal with the confirmed problem statement already written

### Step 5: Gather Requirements

Use the `question` tool to gather initial requirements:

```json
{
  "questions": [{
    "header": "Change Scope",
    "question": "What type of change is this?",
    "options": [
      { "label": "New feature", "description": "Adding new functionality" },
      { "label": "Enhancement", "description": "Improving existing functionality" },
      { "label": "Bug fix", "description": "Fixing incorrect behavior" },
      { "label": "Refactor", "description": "Restructuring without behavior change" },
      { "label": "Other", "description": "Use custom text area for another change type" }
    ]
  }]
}
```

### Step 6: Identify Affected Specs

Use `adv_spec action: "list"` to show existing specs.

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Affected Specs",
    "question": "Which capabilities does this change affect?",
    "multiple": true,
    "options": [
      { "label": "<capability-1>", "description": "Existing capability" },
      { "label": "<capability-2>", "description": "Existing capability" },
      { "label": "New capability", "description": "This creates a new capability spec" },
      { "label": "Other", "description": "Use custom text area to name another capability" }
    ]
  }]
}
```

---

## Requirements Quality

### INVEST Criteria

Ensure each requirement meets INVEST:

| Criterion | Check | If Missing |
|-----------|-------|------------|
| **I**ndependent | Self-contained? | Decouple from other requirements |
| **N**egotiable | Leaves solution flexibility? | Focus on intent, not implementation |
| **V**aluable | Delivers demonstrable value? | State the user benefit |
| **E**stimable | Can be sized? | Break into smaller pieces |
| **S**mall | Fits in one iteration? | Split into phases |
| **T**estable | Can write test for it? | Add acceptance scenario |

### Requirements Smell Detection

Avoid these patterns:

| Smell | Example | Fix |
|-------|---------|-----|
| Subjective | "user-friendly" | "Loads in < 2 seconds" |
| Ambiguous | "efficiently" | "Uses < 100MB memory" |
| Superlative | "best performance" | "95th percentile < 200ms" |
| Totality | "handles all errors" | List specific error types |
| Negative only | "must not crash" | "Returns error code on failure" |

---

## Step 7: Fill Proposal Template

Update `changes/<change-id>/proposal.md` — the `## Why` section is already populated from Phase 1. Fill in the remaining sections:

```markdown
# Change: <summary>

## Why

<already populated from Phase 1 — do not overwrite>

## What Changes

<List the specific changes being made - high level>

## Success Criteria

Each criterion should be:
- Specific and measurable
- Testable (can write a test for it)
- Independent (verifiable on its own)

1. [ ] <INVEST-quality criterion>
2. [ ] <INVEST-quality criterion>

## Affected Code

<List files that will be modified - can be discovered via /adv-prep>

## Related Repositories

If this change requires modifications to other repositories:

| Repo ID | Path | Changes Needed |
|---------|------|----------------|
| <id> | <absolute path> | <brief description> |

## Constraints

- MUST: <non-negotiable requirement>
- MUST NOT: <hard boundary>
- SHOULD: <strong preference>

## Impact

- Affected specs: <list>
- Breaking changes: <yes/no - if yes, document migration>
- Dependencies: <new deps needed?>
- Cross-repo impact: <yes/no - if yes, list repos and changes>

## Context

{If brainstorm exists}
- Brainstorm: ./temp/<brainstorm-file>.md
- Key decisions carried forward:
  - <decision 1>
  - <decision 2>
{end}
```

---

## Step 7.5: Cross-Repo Routing

If the change affects multiple repositories (e.g., frontend + backend, app + database):

### Identify Related Repos

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Cross-Repo Impact",
    "question": "Does this change require modifications to other repositories?",
    "options": [
      { "label": "No", "description": "All changes are in this repository" },
      { "label": "Yes", "description": "Changes needed in other repos too" },
      { "label": "Other", "description": "Use custom text area to clarify routing needs" }
    ]
  }]
}
```

If **Yes**: Gather repo details:
```json
{
  "questions": [{
    "header": "Related Repos",
    "question": "Which repositories need changes? Provide the absolute path for each.",
    "options": [
      { "label": "Backend API", "description": "e.g., ~/dev/my-backend" },
      { "label": "Database/Migrations", "description": "e.g., ~/dev/my-db" },
      { "label": "Infrastructure", "description": "e.g., ~/dev/my-infra" },
      { "label": "Other", "description": "Use custom text area to add another repository" }
    ],
    "multiple": true
  }]
}
```

### Document in Proposal

Add each related repo to the "Related Repositories" table in `proposal.md`.

### Tag Tasks with Target Repo

When adding tasks in Step 8, tasks targeting other repos should include
the `target_repo` or `target_path` in their description. Example:

```
adv_task_add changeId: <id> content: "[backend] Add /api/users endpoint"
adv_task_add changeId: <id> content: "[db] Add users migration"
```

The `/adv-prep` gap analysis will later verify all cross-repo tasks have
proper routing metadata.

---

## Step 8: Add Initial Tasks

Use `adv_task_add` to create initial tasks based on the change type:

**For new features:**
```
adv_task_add changeId: <id> content: "Define spec requirements"
adv_task_add changeId: <id> content: "Implement core functionality (TDD: write tests first, then implement)"
adv_task_add changeId: <id> content: "Add documentation"
```

**For bug fixes:**
```
adv_task_add changeId: <id> content: "Implement fix (TDD: write failing test reproducing the bug, then fix)"
adv_task_add changeId: <id> content: "Add documentation"
```

**For refactors:**
```
adv_task_add changeId: <id> content: "Implement refactoring (TDD: add characterization tests first, then refactor, verify behavior preserved)"
adv_task_add changeId: <id> content: "Add documentation"
```

> **TDD note**: Each implementation task carries its own red/green TDD phases inline.
> Do NOT create separate "Write tests" tasks for the same scope as an implementation task.
> Separate test tasks are only appropriate for cross-cutting verification spanning multiple
> implementation tasks (e.g., integration or E2E tests). Mark those with
> `metadata.tdd_intent: "separate_verification"`.

---

## Step 9: Quick Quality Check

Before finishing, verify:

- [ ] Each criterion is testable (can imagine the test)
- [ ] No subjective language remains
- [ ] Requirements are independent
- [ ] Scope is achievable in reasonable time

If any fail, use the `question` tool to refine.

---

## Output

```
============================================================
                  CHANGE CREATED
============================================================

Change ID: <change-id>
Title: <summary>
Type: <feature|enhancement|bugfix|refactor|breaking>
Status: draft

FILES CREATED:
- changes/<change-id>/change.json
- changes/<change-id>/proposal.md

INITIAL TASKS:
- [ ] <task-1>
- [ ] <task-2>
- [ ] <task-3>

REQUIREMENTS QUALITY:
- INVEST check: {pass|needs review}
- Smell check: {clean|N items to address}

{If brainstorm context used}
CONTEXT FROM:
- ./temp/<brainstorm-file>.md
{end}

============================================================

NEXT STEPS:

1. Review and refine the proposal:
   changes/<change-id>/proposal.md

2. Run gap analysis for completeness:
   /adv-prep <change-id>

3. Validate before implementation:
   /adv-validate <change-id>

4. When ready, implement:
   /adv-apply <change-id>

============================================================
```

### Completion Banner

```
============================================================
       /adv-proposal COMPLETE
============================================================
Result: Change <change-id> created

  ⚡ Recommended next step (Plan agent):
     /adv-research <change-id>   (or /adv-prep <change-id>)
============================================================
```

---

## ADV Tools Reference

| Purpose | Tool |
|---------|------|
| Create change | `adv_change_create summary: "..." proposal: "..."` |
| List changes | `adv_change_list` |
| List specs | `adv_spec action: "list"` |
| Add task | `adv_task_add changeId: <id> content: "..."` |
