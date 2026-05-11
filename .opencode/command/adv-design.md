---
name: adv-design
description: Validate architecture decisions, produce implementation strategy, and present design for user review
---
<!-- manifest: adv-design · gate: design · requiresChangeId: true · prereqs: [adv-discover] · scope: reads[specs, proposal, codebase] · modifies[proposal] -->
# ADV Design — Produce the Design Artifact
Convert the confirmed agreement into a concrete technical design. Command completes the `design` gate and now prepares planning directly.
## Command Boundary
**Produces:** `design.md` covering architecture, key decisions, implementation strategy, LBP analysis, and user-visible design summary needed before planning.

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

<!-- rq-domainContextADR01 -->
> **ADR rubric (sparingly):** When recording a key decision, check the 3-criteria rubric: (1) hard-to-reverse, (2) surprising-without-context, (3) result-of-real-tradeoff. If all three are met, draft an ADR at `docs/adr/NNNN-slug.md` (numbering sequential, slug 3-5 hyphenated words). See `.adv/specs/domain-context/ADR-FORMAT.md` for format and `.adv/specs/domain-context/spec.json` (`rq-domainContextADR01`) for consumer contract. ADR drafts are advisory; they don't gate-block.

Keep the design actionable for `/adv-prep`; it should explain why the plan is correct, not what files exist.

---
## Phase 3: Persist Design
Write `design.md` via `adv_change_update`.

Suggested structure:
```md
# Design
## Architecture Overview
## Key Decisions
## ADR Drafts
Optional: candidate ADRs only when the Phase 2 3-criteria rubric is met. Drafts are advisory and do not gate-block.
## Implementation Strategy
## LBP Analysis
## Affected Components
## Risks / Mitigations
```

---
## Phase 3.5: Validate Design
- Spawn the independent validator agent (`adv-researcher`) with a validator-specific prompt. This step is mandatory — it must run before Phase 4. If task tool is unavailable, skip gracefully and record `INCONCLUSIVE` via `adv_change_update` appended to `design.md` (see Phase 3.6).

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
| `CONFLICT` | Present conflict findings; attempt inline resolution if technical fix is obvious; if unresolved, flag in design notes for the design summary to surface to user before planning; if resolved inline, record the conflict as resolved and proceed |
| `INCONCLUSIVE` (empty/failed/timeout) | Record "Validation attempted but inconclusive" warning; proceed to Phase 4 |

Record the validation result via `adv_change_update` as a compact summary appended to `design.md`.

---
## Phase 4: Present Design Summary
Show a compact summary with:
- architecture overview
- key decisions
- implementation strategy
- major risks / tradeoffs
- optional visual comparison block when side-by-side design alternatives are easier to judge than prose alone. Load `skill("adv-user-intuit")` for the structured comparison presentation protocol if skill is available; otherwise continue with existing inline comparison workflow
- **Validator Result** — always display validator outcome from Phase 3.5/3.6 when validation data exists:
  - `VALIDATED` → one-line note: "Validator: clean pass ✓"
  - `CAUTION` → list caution findings inline (brief, one sentence each)
  - `CONFLICT` → show conflict details with unresolved items highlighted
  - `INCONCLUSIVE` → show warning: "Validation attempted but inconclusive"
  - No validation data (legacy design with no validator markers) → omit section silently

After displaying the validator result:
- If a visual comparison block is used, keep it text-readable and align it with the inline reply choices below
- If the design involves real user-value tradeoffs, emit the **Inline Approval prompt (Tier A)** before moving into `/adv-prep`
- If the validator found an unresolved `CONFLICT`, always pause with the inline approval prompt for user resolution before planning
- If the agent identifies a contract-compromise risk — the design can only be delivered by compromising agreed acceptance criteria, explicit constraints, or stated avoidances (as written in agreement.md) — always pause and surface a discussion of possible routes to user before planning, regardless of validator verdict (see Phase 4.1)
- If the design is straightforward with no user-value tradeoffs, no unresolved `CONFLICT` (resolved Phase 3.6 conflicts do not count), and no contract-compromise risk, and validation returned `VALIDATED`, `CAUTION`, or `INCONCLUSIVE`, proceed directly to `/adv-prep` (no inline pause)

**Inline Approval prompt when pausing** (Tier A per `docs/command-voice-standard.md` § Inline Approval Voice):

After the spine footer line:

```
Reply `continue` (or `go`, `approve`, `looks good`, `proceed`, `lgtm`) to proceed inline to /adv-prep,
or run `/adv-prep {change-id}`.
Want to adjust the design? Reply with what to change.
Want to revisit discovery? Reply `/adv-discover {change-id}` or `revisit discovery`.
Want to stop here? Reply `cancel` or `stop`.
```

**Reply parsing (Tier A):**

| Reply | Action |
|---|---|
| Tier A whitelist match (continue, go, approve, looks good, proceed, etc.) | Begin `/adv-prep` inline |
| `/adv-prep {change-id}` | No-op; OpenCode dispatches |
| `/adv-discover {change-id}` or `revisit discovery` | Halt design; user re-enters discovery |
| Free-form text | Treat as design revision; apply via `adv_change_update`, re-present |
| `cancel` / `stop` | Halt change |

**Anchor phrase:** `Reply `continue``

### Phase 4.1: Contract-Compromise Risk Assessment (Inline)

When the agent recognizes that the chosen design path requires violating an explicit acceptance criterion, constraint, or avoidance stated in agreement.md, it must surface the compromise risk not silently proceed.

If both an unresolved `CONFLICT` and a contract-compromise risk are present, surface them in one combined user discussion, not two separate pauses.

**Trigger:** The design's only viable path breaks a rule user explicitly set.

**Assessment criteria:**
1. Which acceptance criteria, constraints, or avoidances are at risk?
2. Is there a materially different approach that preserves them?
3. What is the minimum viable scope if the compromise is accepted?

**Inline Approval prompt** (Tier A, with route options as inline reply choices):

After presenting the compromise analysis:

```
This design path requires compromising:
- {criterion / constraint / avoidance from agreement.md}
- {why no alternative preserves it}

Reply:
- `keep with compromise` — accept and amend agreement.md, then proceed to /adv-prep
- `revise` (or describe the alternative) — agent finds an alternative path preserving all constraints
- `revisit discovery` (or `/adv-discover {change-id}`) — re-enter discovery to renegotiate scope or objectives
- `defer` — halt the change; this check resurfaces on resume
```

**Reply parsing (Tier A with route extension):**

| Reply | Action |
|---|---|
| `keep with compromise` (or whitelist + explicit acknowledgment) | Amend agreement.md (append "Design Compromise" section), then `/adv-prep` |
| `revise` or revision text | Find alternative design preserving constraints; re-present |
| `revisit discovery` or `/adv-discover {change-id}` | Halt design; user re-enters discovery |
| `defer` / `cancel` / `stop` | Halt change; record reason in change notes |

**Amendment procedure for "keep with compromise":**
- Use `adv_change_update` to append a "Design Compromise" section to agreement.md
- Document: which criterion/constraint/avoidance is compromised, why it was unavoidable, and approval evidence (user's `keep with compromise` reply text + timestamp)
- Only proceed to `/adv-prep` after the amendment is persisted

### Phase 4.5: Persist Revisions
If user requests adjustments, update the design/proposal artifacts via `adv_change_update`.

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

> **{change-id}**
> design ✓ → planning
>
> → `/adv-prep {change-id}`
```

**Auto-continue:** After gate completion (whether user approved with "proceed" or design was straightforward enough to skip user pause), immediately begin `/adv-prep` inline. Do not stop or ask "shall I proceed?" — approval or clean auto-pass is the go-ahead.
