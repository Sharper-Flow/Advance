---
name: adv-proposal
description: Create a new ADV change proposal with requirements and tasks
args:
  - name: summary
    description: Brief description of what this change accomplishes
    required: true
---

# /adv-proposal - Create Change Proposal

Create a structured change proposal that defines new requirements, modifications, or removals to existing specs.

## Arguments

- `summary` (required): Brief description of the change (e.g., "Add user authentication")

## Process

### Phase 1: Gather Requirements

1. Analyze the provided summary
2. If the change affects existing specs, use `adv_spec_search` to find related requirements
3. Determine:
   - Which capabilities are affected
   - What requirements need to be added/modified/removed
   - What tasks are needed to implement the change

### Phase 2: Create Change Scaffold

1. Call `adv_change_create` with the summary to create the change directory
2. This creates:
   - `changes/{change-id}/change.json` - The change definition
   - `changes/{change-id}/proposal.md` - Human-readable proposal

### Phase 3: Define Requirements

For each requirement being added, ensure it has:
- Clear, testable title
- Body explaining the requirement
- Priority (must/should/may)
- At least one scenario (Given/When/Then)

Present the proposed requirements to the user for review:

```
============================================================
                  CHANGE PROPOSAL
============================================================
ID: {change-id}
Title: {title}

AFFECTED CAPABILITIES:
- {capability-1}: {add/modify/remove} {count} requirement(s)

PROPOSED REQUIREMENTS:
{for each requirement}
[{priority}] {id}: {title}
  {body summary}
  Scenarios: {scenario_count}
{end}

TASKS:
{for each task}
- [ ] {task_title}
{end}
============================================================
```

### Phase 4: Confirm

Use `mcp_question` to confirm:

```
header: "Confirm Proposal"
question: "Create this change proposal?"
options:
  - label: "Create proposal (Recommended)"
    description: "Create the change and begin work"
  - label: "Modify requirements"
    description: "Adjust before creating"
  - label: "Cancel"
    description: "Discard the proposal"
```

## Post-Creation

After confirmation:
1. Update the `change.json` with the full requirement definitions
2. Set status to "active" if ready to begin work
3. Output the path to the proposal file for editing
4. Suggest next step: `/adv-validate {change-id}` to validate

## Example

```
User: /adv-proposal Add rate limiting to API endpoints

Agent: I'll create a change proposal for adding rate limiting.

[Searches for existing API-related requirements]
[Creates change scaffold]
[Presents proposed requirements]
[Confirms with user]

============================================================
                  CHANGE CREATED
============================================================
Change ID: add-rate-limiting-abc123
Proposal: changes/add-rate-limiting-abc123/proposal.md

Next steps:
1. Edit proposal.md to refine requirements
2. Run /adv-validate add-rate-limiting-abc123
3. Begin implementation with /adv-apply add-rate-limiting-abc123
============================================================
```

## Notes

- Each change should focus on a single coherent feature or fix
- Requirements must be verifiable (testable)
- Scenarios should cover happy path and error cases
- Tasks should be granular enough to track progress
