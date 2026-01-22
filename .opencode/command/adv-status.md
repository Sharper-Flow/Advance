---
name: adv-status
description: Show ADV project status - specs, changes, and recommendations
---

# /adv-status - Project Status Overview

Display the current state of the ADV-managed project including specs, active changes, and recommendations.

## Execution

1. Call the `adv_status` tool to get project overview
2. Format and display the results clearly

## Output Format

```
============================================================
                    ADV PROJECT STATUS
============================================================

SPECS ({count} capabilities):
{for each spec}
- {name}: {requirementCount} requirements (v{version})
{end}

CHANGES:
- Active: {active_count}
- By Status: draft={draft}, pending={pending}, active={active}, archived={archived}

{if recommendations.length > 0}
RECOMMENDATIONS:
{for each recommendation}
- {recommendation}
{end}
{end}

============================================================
```

## Example Usage

```
User: /adv-status
Agent: [calls adv_status tool]
Agent: [displays formatted status]
```

## Notes

- This is a read-only command - it doesn't modify any state
- Use this to get an overview before starting work
- Recommendations will suggest next actions (e.g., "Ready to archive: change-xyz")
