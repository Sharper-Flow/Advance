---
name: adv-agree
description: Present objectives and constraints for user acceptance
---

# ADV Agree — Confirm Shared Objectives

Present the discovery output back to the user and turn confirmed objectives, constraints, avoidances, and acceptance criteria into `agreement.md`. This command is part of the discovery stage; the `discovery` gate is completed by `/adv-discover`.

## Command Boundary

**Produces:** `agreement.md` with shared objectives, AC, constraints, avoidances, and user sign-off.

**× MUST NOT:** Create tasks, complete gates, or introduce new architecture decisions that belong in `/adv-design`.

**Gate:** None — `/adv-discover` owns `discovery`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---

## Phase 1: Load Discovery Context

- `adv_change_show`
- confirm discovery findings exist and are current
- extract objectives, constraints, avoidances, open questions, and draft acceptance criteria

If discovery work is missing or obviously stale → stop and run `/adv-discover` first.

---

## Phase 2: Present Agreement Draft

Present a concise agreement view:

- **Objectives**
- **Acceptance Criteria**
- **Constraints**
- **Avoidances / rejected approaches**
- **Open questions**

Ask for explicit user confirmation or edits using the `question` tool.

Recommended options:
- Confirm agreement
- Revise objectives/criteria
- Revise constraints/avoidances

---

## Phase 3: Persist Agreement

Once confirmed, write `agreement.md` through `adv_change_update`.

Suggested structure:

```md
# Agreement

## Objectives
## Acceptance Criteria
## Constraints
## Avoidances
## Open Questions
## Sign-Off
```

Do not complete any gate here.

---

## Output

Emit AGREEMENT RECORDED with:

- target change
- confirmed objectives
- AC count
- unresolved questions, if any

```
/adv-agree {change-id} COMPLETE
Result: agreement.md recorded
Next: /adv-design {change-id}
```
