---
name: adv-proposal
description: Create a new ADV change proposal with scaffolding
agent: build
args:
  - name: summary
    description: Brief summary of the change (becomes change title)
    required: true
---

# ADV Proposal

Create a new change proposal for the ADV system.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Pre-flight Checks

### Step 1: Validate Arguments

If `$ARGUMENTS` is empty or whitespace:
```
Usage: /adv-proposal "brief summary of the change"

Example: /adv-proposal "add user authentication"
```
Stop execution.

### Step 2: Check for Existing Changes

Call `adv_change_list` to check for active changes.

**If similar change exists:**
- Use `mcp_question`:
  ```
  header: "Similar Change"
  question: "Found similar active change '<change-id>'. Continue anyway?"
  options:
    - label: "Create new (Recommended)"
      description: "Create a separate change proposal"
    - label: "Show existing"
      description: "View the existing change instead"
    - label: "Cancel"
      description: "Do not create"
  ```

## Create Change

### Step 3: Create Change Scaffold

Call `adv_change_create summary: "$ARGUMENTS"`

This will create:
- `changes/<change-id>/change.json` - Change metadata
- `changes/<change-id>/proposal.md` - Human-readable proposal template

### Step 4: Read Created Files

Read the created `proposal.md` to understand the template.

### Step 5: Gather Requirements

Use `mcp_question` to gather initial requirements:

```
header: "Change Scope"
question: "What type of change is this?"
options:
  - label: "New feature"
    description: "Adding new functionality"
  - label: "Enhancement"
    description: "Improving existing functionality"
  - label: "Bug fix"
    description: "Fixing incorrect behavior"
  - label: "Refactor"
    description: "Restructuring without behavior change"
  - label: "Breaking change"
    description: "Changes that affect existing behavior"
```

### Step 6: Identify Affected Specs

Use `adv_spec_list` to show existing specs.

Use `mcp_question`:
```
header: "Affected Specs"
question: "Which capabilities does this change affect?"
multiple: true
options:
  - <list of existing capabilities>
  - label: "New capability"
    description: "This creates a new capability spec"
```

### Step 7: Fill Proposal Template

Update `changes/<change-id>/proposal.md` with:

```markdown
# Change: <summary>

## Why

<Explain the motivation for this change>

## What Changes

<List the specific changes being made>

## Affected Code

<List files that will be modified - can be discovered later>

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>

## Constraints

- MUST NOT: <any hard boundaries>
- MUST: <any requirements>

## Impact

- Affected specs: <list>
- Breaking changes: <yes/no>
- Migration needed: <yes/no>
```

### Step 8: Add Initial Tasks

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

## Output

```
============================================================
                  CHANGE CREATED
============================================================

Change ID: <change-id>
Title: <summary>
Status: draft

FILES CREATED:
- changes/<change-id>/change.json
- changes/<change-id>/proposal.md

INITIAL TASKS:
- [ ] <task-1>
- [ ] <task-2>
- [ ] <task-3>

============================================================

NEXT STEPS:

1. Review and edit the proposal:
   changes/<change-id>/proposal.md

2. Add spec deltas defining requirements:
   - Create specs/<capability>/spec.json in the change
   - Or modify existing specs with deltas

3. Validate the change:
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
============================================================
```

---

## ADV Tools Reference

- `adv_change_create summary: "..."` - Create change scaffold
- `adv_change_list` - List existing changes
- `adv_spec_list` - List existing specs
- `adv_task_add change_id: <id> title: "..."` - Add task
