---
name: adv-present
description: Present concise design overview for user review before planning
---
# ADV Present — Review Design Before Planning
Present the completed design back to the user in a concise, decision-oriented format before task synthesis begins. This command is part of the design stage; the `design` gate is completed by `/adv-design`.
## Command Boundary
**Produces:** User-visible design summary and any final corrections needed before planning.

**× MUST NOT:** Create tasks or complete gates.

**Gate:** None — `/adv-design` owns `design`.

**Human checkpoint (conditional):** Pause for design approval only when real tradeoffs depend on user values or product vision. For straightforward deterministic designs with no user-value tradeoffs, proceed directly to `/adv-prep` without a design-approval pause.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---
## Phase 1: Load Design
- `adv_change_show`
- extract the most important decisions from `design.md`
- summarize affected components and sequencing

If the design artifact is missing, stop and run `/adv-design` first.

---
## Phase 2: Present Summary
Show a compact summary with:
- architecture overview
- key decisions
- implementation strategy
- major risks / tradeoffs

If the design involves real user-value tradeoffs, ask the user whether the design is acceptable before moving into `/adv-prep`. If the design is straightforward with no user-value tradeoffs, proceed directly to `/adv-prep`.

Recommended options (when pausing):
- Looks good — proceed to planning
- Adjust design details
- Revisit discovery/agreement

---
## Phase 3: Persist Revisions
If the user requests adjustments, update the design/proposal artifacts via `adv_change_update`.

Do not complete any gate here.

---
## Output
Emit DESIGN PRESENTED with:
- target change
- key decisions shown
- any user-requested revisions
```
/adv-present {change-id} COMPLETE
Result: design summary presented
Next: /adv-prep {change-id}
```
