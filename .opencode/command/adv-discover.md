---
name: adv-discover
description: Gather context, analyze current state, and identify objectives
---

# ADV Discover — Establish Discovery Findings

Gather the current-state evidence needed to move from proposal into a shared agreement. This command completes the `discovery` gate and prepares `/adv-agree`.

## Command Boundary

**Produces:** Discovery findings, current-state analysis, blocker/options summary, recommended objectives for agreement.

**× MUST NOT:** Create tasks, complete non-discovery gates, skip LBP validation when multiple viable directions exist.

**Gate:** Completes `discovery`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool
3. If none exist → stop and suggest `/adv-proposal`

---

## Phase 1: Load Context

- `adv_change_show` for the target change
- `adv_gate_status` to confirm proposal is already complete
- `adv_spec action: "list"` and `adv_spec action: "show"` for affected capabilities
- Use `lgrep`/`read` to inspect the relevant code paths, interfaces, and constraints

If the proposal gate is still pending → stop and direct the user to `/adv-proposal` first.

---

## Phase 2: Discovery Analysis

Build a compact discovery report covering:

1. **Current state** — what exists today in code/specs/docs
2. **Objectives** — what must become true for the change to succeed
3. **Constraints** — technical, product, workflow, or compatibility limits
4. **Blockers / unknowns** — decisions that require explicit agreement
5. **LBP check** — whether the likely direction matches long-term best practice
6. **Options** — only when there are real tradeoffs worth presenting to the user

If there are 2+ viable approaches with user-value tradeoffs, use the prioritizer workflow before asking questions.

---

## Phase 3: Persist Discovery Findings

Update the proposal artifact with the discovery findings so `/adv-agree` can present them cleanly.

- Use `adv_change_update` to refine proposal content
- Keep findings concise and decision-oriented
- Do not create `agreement.md` here

---

## Phase 4: Complete Gate

`adv_gate_complete changeId: {change-id} gateId: discovery`

If the gate cannot be completed, surface the blocking reason and stop.

---

## Output

Emit DISCOVERY COMPLETE with:

- target change
- current-state summary
- objectives
- constraints
- open blockers/questions for `/adv-agree`

```
/adv-discover {change-id} COMPLETE
Result: discovery findings recorded
Discovery Gate: MARKED COMPLETE
Next: /adv-agree {change-id}
```
