---
name: adv-proposal
description: Create a new ADV change proposal with INVEST-quality requirements. Optionally pass a summary — if omitted, the agent derives a title from the recent conversation.
agent: build
---

# ADV Proposal - Create Change with Quality Requirements

Create a new change proposal for the ADV system. Uses INVEST criteria and requirements smell detection to ensure high-quality, implementable specifications.

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

**Never stop execution or print a usage error when `$ARGUMENTS` is empty.** If the conversation contains no clear prior topic, pick a reasonable working title (e.g. "explore new feature") — the user will refine it via the scope question in Step 5.

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
        { "label": "Cancel", "description": "Do not create" }
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

## Create Change

### Step 4: Create Change Scaffold

Call `adv_change_create summary: "<resolved summary from Step 1>"`

This will create:
- `changes/<change-id>/change.json` - Change metadata
- `changes/<change-id>/proposal.md` - Human-readable proposal template

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
      { "label": "Breaking change", "description": "Changes that affect existing behavior" }
    ]
  }]
}
```

### Step 6: Identify Affected Specs

Use `adv_spec_list` to show existing specs.

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
      { "label": "New capability", "description": "This creates a new capability spec" }
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

Update `changes/<change-id>/proposal.md` with:

```markdown
# Change: <summary>

## Why

<Explain the motivation for this change - the problem being solved>

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
      { "label": "Yes", "description": "Changes needed in other repos too" }
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
      { "label": "Infrastructure", "description": "e.g., ~/dev/my-infra" }
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
adv_task_add change_id: <id> title: "[backend] Add /api/users endpoint"
adv_task_add change_id: <id> title: "[db] Add users migration"
```

The `/adv-prep` gap analysis will later verify all cross-repo tasks have
proper routing metadata.

---

## Step 8: Add Initial Tasks

Use `adv_task_add` to create initial tasks based on the change type:

**For new features:**
```
adv_task_add change_id: <id> title: "Define spec requirements"
adv_task_add change_id: <id> title: "Write acceptance tests"
adv_task_add change_id: <id> title: "Implement core functionality"
adv_task_add change_id: <id> title: "Add documentation"
```

**For bug fixes:**
```
adv_task_add change_id: <id> title: "Write failing test for bug"
adv_task_add change_id: <id> title: "Implement fix"
adv_task_add change_id: <id> title: "Verify fix with test"
```

**For refactors:**
```
adv_task_add change_id: <id> title: "Add characterization tests"
adv_task_add change_id: <id> title: "Perform refactoring"
adv_task_add change_id: <id> title: "Verify behavior preserved"
```

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
| Create change | `adv_change_create summary: "..."` |
| List changes | `adv_change_list` |
| List specs | `adv_spec_list` |
| Add task | `adv_task_add change_id: <id> title: "..."` |
