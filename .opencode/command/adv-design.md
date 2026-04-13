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
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

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
## Phase 3.5: Validate Design
- Spawn `adv-researcher` with a validator-specific prompt. This step is mandatory — it must run before Phase 4. If the task tool is unavailable, skip gracefully and record `INCONCLUSIVE` via `adv_change_update` appended to `design.md` (see Phase 3.6).

**Validator input:** design.md content + compact agreement summary (objectives, AC, constraints, avoidances).

**Validator prompt template:**
```
ROLE: Design validator for ADV change {change-id}.
WORKING DIRECTORY: {workdir}

DESIGN UNDER REVIEW:
{design.md content}

AGREEMENT CONTEXT:
Objectives: {numbered objectives from agreement}
Acceptance Criteria: {numbered AC}
Constraints: {constraints}
Avoidances: {avoidances}

VALIDATION DIMENSIONS:
1. CORRECTNESS — Does this design solve the stated objectives? Are there logical gaps?
2. SIMPLICITY — Is there a materially simpler approach achieving the same objectives?
3. SPEC-LAW COMPLIANCE — Does this design contradict any existing spec requirement? Use adv_spec to check.
4. KEY ALTERNATIVES — Was a significant viable alternative overlooked?

OUTPUT_SCHEMA:
DESIGN_VALIDATION:
  verdict: VALIDATED | CAUTION | CONFLICT
  findings:
    - dimension: {1-4}
      level: info | caution | conflict
      summary: {one sentence}
      detail: {explanation}
  recommendation: {one paragraph}

BUDGET: Focus on the 4 dimensions only. Do not rewrite the design.
STOP_WHEN: You have a verdict with evidence for each dimension.
```

---
## Phase 3.6: Handle Verdict
Process the validator output and determine whether to proceed:

| Verdict | Action |
|---------|--------|
| `VALIDATED` | Record "Validator: clean pass" in design notes; proceed to Phase 4 |
| `CAUTION` | Record caution findings in design notes; proceed to Phase 4 |
| `CONFLICT` | Present conflict findings; attempt inline resolution if technical fix is obvious; if unresolved, flag in design notes for `/adv-present` to surface to user before planning; if resolved inline, record the conflict as resolved and proceed |
| `INCONCLUSIVE` (empty/failed/timeout) | Record "Validation attempted but inconclusive" warning; proceed to Phase 4 |

Record the validation result via `adv_change_update` as a compact summary appended to `design.md`.

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
