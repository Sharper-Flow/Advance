---
name: adv-design
description: Validate architecture decisions, produce implementation strategy, and present design for user review
---
# ADV Design — Produce the Design Artifact
Convert the confirmed agreement into a concrete technical design. This command completes the `design` gate and now prepares planning directly.
## Command Boundary
**Produces:** `design.md` covering architecture, key decisions, implementation strategy, LBP analysis, and the user-visible design summary needed before planning.

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

If agreement is missing or not approved, stop and complete `/adv-discover` first.

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
- Spawn the independent validator agent (`adv-researcher`) with a validator-specific prompt. This step is mandatory — it must run before Phase 4. If the task tool is unavailable, skip gracefully and record `INCONCLUSIVE` via `adv_change_update` appended to `design.md` (see Phase 3.6).

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
| `CONFLICT` | Present conflict findings; attempt inline resolution if technical fix is obvious; if unresolved, flag in design notes for the design summary to surface to the user before planning; if resolved inline, record the conflict as resolved and proceed |
| `INCONCLUSIVE` (empty/failed/timeout) | Record "Validation attempted but inconclusive" warning; proceed to Phase 4 |

Record the validation result via `adv_change_update` as a compact summary appended to `design.md`.

---
## Phase 4: Present Design Summary
Show a compact summary with:
- architecture overview
- key decisions
- implementation strategy
- major risks / tradeoffs
- optional visual comparison block when side-by-side design alternatives are easier to judge than prose alone. Load `skill("adv-user-intuit")` for the structured comparison presentation protocol if the skill is available; otherwise continue with the existing inline comparison workflow
- **Validator Result** — always display validator outcome from Phase 3.5/3.6 when validation data exists:
  - `VALIDATED` → one-line note: "Validator: clean pass ✓"
  - `CAUTION` → list caution findings inline (brief, one sentence each)
  - `CONFLICT` → show conflict details with unresolved items highlighted
  - `INCONCLUSIVE` → show warning: "Validation attempted but inconclusive"
  - No validation data (legacy design with no validator markers) → omit section silently

After displaying the validator result:
- If a visual comparison block is used, keep it text-readable and align it with any follow-up `question` options
- If the design involves real user-value tradeoffs, ask the user whether the design is acceptable before moving into `/adv-prep`
- If the validator found an unresolved `CONFLICT`, always pause for user resolution before planning
- If the agent identifies a contract-compromise risk — the design can only be delivered by compromising agreed acceptance criteria, explicit constraints, or stated avoidances (as written in agreement.md) — always pause and surface a discussion of possible routes to the user before planning, regardless of validator verdict
- If the design is straightforward with no user-value tradeoffs, no unresolved `CONFLICT` (resolved Phase 3.6 conflicts do not count), and no contract-compromise risk, and validation returned `VALIDATED`, `CAUTION`, or `INCONCLUSIVE`, proceed directly to `/adv-prep`

Recommended options (when pausing):
- Looks good — proceed to planning (agent begins `/adv-prep` inline immediately)
- Adjust design details
- Revisit discovery/agreement
- Keep design with documented compromise — amend agreement to reflect the necessary concession, then proceed
- Cancel this change

### Phase 4.1: Contract-Compromise Risk Assessment

When the agent recognizes that the chosen design path requires violating an explicit acceptance criterion, constraint, or avoidance stated in agreement.md, it must surface the compromise risk rather than silently proceed.

If both an unresolved `CONFLICT` and a contract-compromise risk are present, surface them in one combined user discussion, not two separate pauses.

**Trigger:** The design's only viable path breaks a rule the user explicitly set.

**Assessment criteria:**
1. Which acceptance criteria, constraints, or avoidances are at risk?
2. Is there a materially different approach that preserves them?
3. What is the minimum viable scope if the compromise is accepted?

**Route options (present to user):**
1. **Keep design with documented compromise** — accept the compromise and amend agreement.md via `adv_change_update` to document the change, then proceed
2. **Revise design** — find an alternative path that preserves all constraints
3. **Revisit agreement/discovery** — return to `/adv-discover` to renegotiate scope or objectives
4. **Defer the change** — halt the change and capture the reason in the change notes; this check must surface again when the change resumes

**Amendment procedure for "keep with compromise":**
- Use `adv_change_update` to append a "Design Compromise" section to agreement.md
- Document: which criterion/constraint/avoidance is compromised, why it was unavoidable, and approval evidence including timestamp and explicit user approval
- Only proceed to `/adv-prep` after the amendment is persisted

### Phase 4.5: Persist Revisions
If the user requests adjustments, update the design/proposal artifacts via `adv_change_update`.

Do not complete any gate here.

---
## Phase 5: Complete Gate
`adv_gate_complete changeId: {change-id} gateId: design`

---
## Output

Use the Gate Handoff Voice spine (see `docs/command-voice-standard.md § Gate Handoff Voice`):

```
## Problem
{One-line restatement of the problem this change addresses.}

## Chosen direction
Chosen architecture + key tradeoff outcomes.

## Delivered
- design.md recorded
- Primary decisions documented
- Implementation strategy defined
- Validator result: {VALIDATED|CAUTION|CONFLICT|INCONCLUSIVE}

---
**{change-id}** · design ✓ → planning · `/adv-prep {change-id}`
```

**Auto-continue:** After gate completion (whether user approved with "proceed" or design was straightforward enough to skip user pause), immediately begin `/adv-prep` inline. Do not stop or ask "shall I proceed?" — approval or clean auto-pass is the go-ahead.
