---
name: adv-status
description: Show ADV project overview - specs, changes, and recommendations
agent: build
---

# ADV Status

Show the current state of the ADV project including specs, active changes, and recommendations.

## Execution

Call `adv_status` to get the project overview.

Display the results in a formatted view:

```
============================================================
                    ADV PROJECT STATUS
============================================================

SPECS (The Laws)
----------------
Total: <count> capabilities

<for each capability>
- <capability-name>: <requirement-count> requirements
<end>

ACTIVE CHANGES
--------------
<if none>
No active changes.

Suggestions:
- Create a new change: /adv-proposal "summary"
<end>

<if changes exist>
Total: <count> changes

<for each change>
- <change-id>: <title>
  Status: <status>
  Tasks: <completed>/<total> complete
  <if has blockers>Blocked by: <blocker><end>
<end>
<end>

ARCHIVED CHANGES
----------------
<if none>
No archived changes.
<end>

<if archives exist>
Total: <count> archived
Recent:
<for last 5>
- <date>: <change-id> - <title>
<end>
<end>

RECOMMENDATIONS
---------------
<based on state>

<if no specs and no changes>
1. Initialize your first spec: Create specs/<capability>/spec.json
2. Or start with a change: /adv-proposal "add user authentication"
<end>

<if specs exist but no changes>
1. Review existing specs: adv_spec_list
2. Create a change when ready: /adv-proposal "summary"
<end>

<if changes in draft>
1. Complete draft change: Edit changes/<change-id>/
2. Validate when ready: /adv-validate <change-id>
<end>

<if changes active>
1. Continue implementation: /adv-apply <change-id>
2. Or review progress: adv_task_list change_id: <id>
<end>

<if all tasks done>
1. Archive completed change: /adv-archive <change-id>
<end>

============================================================
```

## Quick Actions

Based on the status, suggest the most relevant next action:

| State | Suggested Action |
|-------|------------------|
| No specs, no changes | `/adv-proposal "initial feature"` |
| Specs exist, no changes | `/adv-proposal "next feature"` |
| Draft change exists | `/adv-validate <change-id>` |
| Active change, tasks pending | `/adv-apply <change-id>` |
| Active change, all tasks done | `/adv-archive <change-id>` |
| Multiple active changes | Show selection for focus |

## Completion Banner

```
============================================================
      /adv-status COMPLETE
============================================================
```
