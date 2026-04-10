---
name: adv-design
description: Validate architecture decisions and produce implementation strategy
---

# ADV Design — Produce the Design Artifact

Convert the confirmed agreement into a concrete technical design. This command completes the `design` gate and prepares `/adv-present` and `/adv-prep`.

## Command Boundary

**Produces:** `design.md` covering architecture, key decisions, implementation strategy, and LBP analysis.

**× MUST NOT:** Create tasks, complete non-owned gates, or skip research when design choices depend on framework/library guidance.

**Gate:** Completes `design`.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool

---

## Phase 1: Load Agreement Context

- `adv_change_show`
- review proposal + agreement artifacts
- inspect affected code with `lgrep`/`read`
- use Context7 when framework/library best practice matters

If agreement is missing or not approved, stop and run `/adv-agree` first.

---

## Phase 2: Design Work

Produce a design covering:

1. **Architecture overview**
2. **Key decisions and rationale**
3. **Implementation strategy / sequencing**
4. **Interfaces and affected components**
5. **LBP analysis** — why this is the preferred long-term approach
6. **Risks and mitigations**

Keep the design actionable for `/adv-prep`; it should explain why the plan is correct, not just what files exist.

---

## Phase 3: Persist Design

Write `design.md` via `adv_change_update`.

Suggested structure:

```md
# Design

## Architecture Overview
## Key Decisions
## Implementation Strategy
## LBP Analysis
## Affected Components
## Risks / Mitigations
```

---

## Phase 4: Complete Gate

`adv_gate_complete changeId: {change-id} gateId: design`

---

## Output

Emit DESIGN COMPLETE with:

- target change
- primary decisions
- implementation strategy summary
- main risks/mitigations

```
/adv-design {change-id} COMPLETE
Result: design.md recorded
Design Gate: MARKED COMPLETE
Next: /adv-present {change-id}
```
