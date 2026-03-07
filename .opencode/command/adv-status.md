---
name: adv-status
description: Show project overview: specs, active changes, and next-step recommendations
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
Total: <count> changes (sorted by most recent activity)

<for each change in changes.recent>
- <recency-emoji> <change-id>: <title>
  Status: <status> | Tasks: <completed>/<total> | Last activity: <relative-time>
  <if recency == "hot">🔥 Active <minutes>m ago — likely in-flight<end>
  <if recency == "warm">⏳ Last active <hours>h ago<end>
  <if recency == "stale">⏰ Stale (<hours>h ago) — needs pickup<end>
  <if has blockers>Blocked by: <blocker><end>
<end>

Recency bands:
  🔥 hot  = activity within last 60 minutes (likely another agent working)
  ⏳ warm = 1-3 hours since last activity
  ⏰ stale = 3+ hours since last activity (resume candidate)
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
<based on state — includes manifest-driven gate recommendations>

<if no specs and no changes>
1. Initialize your first spec: Create specs/<capability>/spec.json
2. Or start with a change: /adv-proposal "add user authentication"
<end>

<if specs exist but no changes>
1. Review existing specs: adv_spec action: "list"
2. Create a change when ready: /adv-proposal "summary"
<end>

<if changes in draft>
1. Complete draft change: Edit changes/<change-id>/
2. Validate when ready: /adv-validate <change-id>
<end>

<if changes active with incomplete gates>
Gate-based recommendations are derived from the workflow manifest
(plugin/src/manifest.ts). For each active change, the tool identifies
the first incomplete gate and recommends the command that triggers it:

  research → /adv-research <change-id>
  prep → /adv-prep <change-id>
  implementation → /adv-apply <change-id>
  review → /adv-review <change-id>
  harden → /adv-harden <change-id>
  signoff → (user confirmation required)
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

  ⚡ Recommended next step (Scout agent):
     Use this status snapshot to choose the next command.
============================================================
```
