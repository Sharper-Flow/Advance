---
name: adv-research
description: Retired: use /adv-discover and /adv-design instead
---

# ADV Research — Retired Command

`/adv-research` is retired in the collaborative 7-gate workflow.

Use:

- `/adv-discover <change-id>` for current-state analysis, objectives, blockers, and discovery findings
- `/adv-design <change-id>` for architecture validation, LBP decisions, and implementation strategy

## Command Boundary

**Produces:** Redirect guidance only.

**× MUST NOT:** Create tasks, complete gates, or mutate change state beyond a redirect note.

**Gate:** None.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Output

Emit RETIRED COMMAND banner with the recommended replacement sequence:

```
/adv-research RETIRED
Use: /adv-discover {change-id}
Then: /adv-design {change-id}
```
