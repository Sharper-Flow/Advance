---
name: adv-design
description: Validate architecture decisions, produce implementation strategy, and present design for user review
---

# ADV Design — Produce the Design Artifact

Convert the confirmed agreement into a concrete technical design. Command completes the `design` gate and now prepares planning directly. Design may add design-derived technical criteria; it must not invent new user-facing acceptance criteria.

## Command Boundary

**Produces:** The design artifact (`change.documents.design`) covering architecture, key decisions, implementation strategy, Design-Derived Criteria, LBP analysis, and user-visible design summary needed before planning.

**× MUST NOT:** Create tasks, complete non-owned gates, invent new user-facing acceptance criteria, or skip research when design choices depend on framework/library guidance.

**Gate:** Completes `design`.
<UserRequest>
$ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---

## Phase 1: Load Agreement Context

- `adv_change_show include: { proposal: true, agreement: true }`
- review proposal + agreement content from `_proposal` / `_agreement` (or packet state), not artifact paths
- inspect affected code with `lgrep`/`read`
- use Context7 when framework/library best practice matters
- **Epic context:** if the change has `epic_membership`, load compact Epic context with `adv_change_show` (Epics include entries) and consider the Epic narrative/entry order when sequencing design decisions. Epic order is advisory; do not let it block design gate completion.

If agreement is missing or not approved, stop and complete `/adv-discover` first.

---

## Phase 2: Design Work

Produce a design covering:

1. **Architecture overview**
2. **Key decisions and rationale**
3. **Implementation strategy / sequencing**
4. **Interfaces and affected components**
5. **LBP analysis** — why this is the preferred long-term approach
6. **Design-Derived Criteria** — technical budgets/limits created by the chosen architecture (performance, security, scale, migration, or operations)
7. **Risks and mitigations** — a risk that a finding or concern might be lost MUST be framed as a durable backlog-status change (route it to `adv_change_create status: "backlog"`), never as `no change owns it`; an unrecorded risk is a dropped finding.

Criteria boundary:

- Design explains how discovery-approved AC/SC will be delivered.
- Design MAY add technical criteria that derive from architecture.
- Design MUST NOT invent new user-facing acceptance criteria.
- If design invalidates an approved AC/SC, treat discovery re-entry as routine: call `adv_change_reenter fromGate: "discovery"` with the criteria delta, then rerun discovery/design/prep. Do not silently rewrite agreement criteria in design.

> **ADR rubric (sparingly):** When recording a key decision, check the 3-criteria rubric: (1) hard-to-reverse, (2) surprising-without-context, (3) result-of-real-tradeoff. If all three are met, draft an ADR at `docs/adr/NNNN-slug.md` (numbering sequential, slug 3-5 hyphenated words). See `.adv/specs/domain-context/ADR-FORMAT.md` for format and `.adv/specs/domain-context/spec.json` (`rq-domainContextADR01`) for consumer contract. ADR drafts are advisory; they don't gate-block.

### Lever citation (precondition)

For every mechanism this design proposes to change, cite the **call site** where that mechanism takes effect — not where it is declared. A design that cites only a configuration file, constant, or schema declaration has not located its lever and is not ready for validation. Where the lever is a scoring, ranking, or policy input, additionally confirm no earlier stage preempts it (fixed bands, short circuits, hard filters, or empty inputs that render the weight inert).

This obligation operationalizes P38 (`declaration-is-not-behavior`) at the design gate: a declaration is not behavior, and a design that has not traced its proposed lever from declaration through loader to consuming call site is building on an unverified premise. The validator (Phase 3.5) may confirm presence of these citations; it must not be the first reader to notice their absence.

Keep the design actionable for `/adv-prep`; it should explain why the plan is correct, not what files exist.

---

## Phase 2.5: Design Leverage Scout

`skill("adv-opportunity-scout")` → bounded scout methodology (modes, output schema, routing taxonomy, prompt templates, opt-out, degradation). Use `design` mode for this phase. If skill is unavailable, the scout phase is inconclusive and recorded in the phase output; do not auto-adopt or surface candidates without the skill's routing taxonomy.

When the design involves module shape, interface design, seam placement, or testability, load `skill("adv-codebase-design")` for the shared architecture vocabulary (module, interface, depth, seam, adapter, leverage, locality), the deletion test, and the dependency categories. Use its terms exactly.

### Integration with Validator

Auto-adopted candidates from the scout are incorporated into the design before the validator runs (Phase 3.5). The validator then validates the design including any adopted improvements.

### Output

- "Design Leverage Scout" section in the design artifact with: candidates considered (count), auto-adopted (count + summary), surfaced to user (count + summary), inconclusive/skipped (if applicable).

---

## Phase 3: Persist Design

Persist design content via `adv_change_update design` (`change.documents.design`).

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

## Design-Derived Criteria

Technical criteria caused by the chosen architecture only; no new user-facing AC.

## Risks / Mitigations
```

---

## Phase 3.5: Validate Design

- Spawn the independent validator agent (`adv-researcher`) with a validator-specific prompt. This step is mandatory — it must run before Phase 4. If task tool is unavailable, skip gracefully and record `INCONCLUSIVE` via `adv_change_update design` appended to the design projection (see Phase 3.6).

**Validator input:** design artifact content + generated researcher-lane briefing packet (`adv_change_show include: { briefingPacket: true, briefingPacketLane: "researcher" }`). Inject `_briefingPacket` for agreement context; do not reconstruct objectives, AC, constraints, avoidances, affected_files, or epic_context manually. Do not ask validator to read `artifacts.*.path`.

**Validator prompt template:**

```
ROLE: Design validator for ADV change {change-id}.
WORKING DIRECTORY: {workdir}
CHANGE: {change-id} | {title} | gate: design
SCOPE KEY: researcher:design-validation
ATTEMPT: {attempt-number, starting at 1 for this researcher worker}
TASK_SCOPE: validate the proposed design against agreement, specs, and external evidence
IN_SCOPE:
  - inline design artifact content, inline agreement objectives/AC/constraints/avoidances, relevant specs, official docs/examples
OUT_OF_SCOPE:
  - rewriting the design, adding unapproved scope, user-value tradeoff decisions
DONE_WHEN:
  - validator Architecture Judgement is supported by sources or explicit inconclusive notes
STOP_WHEN:
  - contract compromise, security/release blocker, or conflict requiring orchestrator decision
VERIFICATION:
  required_when_possible:
    - cite spec/doc/source evidence for each caution or conflict
  optional_additional_checks: true

DESIGN UNDER REVIEW:
{design artifact content}

BRIEFING PACKET: inject the generated `_briefingPacket` (lane: researcher) here — includes identity_anchors, scope, contract, affected_files, epic_context, durable_facts, unavailable_state

ARCHITECTURE JUDGEMENT DIMENSIONS:
1. CORRECTNESS — Does this design solve the stated objectives? Are there logical gaps? → maps to architecture_judgement.risk
2. SIMPLICITY — Is there a materially simpler approach achieving the same objectives? → maps to architecture_judgement.tradeoffs[]
3. SPEC-LAW COMPLIANCE — Does this design contradict any existing spec requirement? Use adv_spec to check. → maps to architecture_judgement.spec_law_implications
4. KEY ALTERNATIVES — Was a significant viable alternative overlooked? → maps to architecture_judgement.alternatives_considered[]

OUTPUT_SCHEMA:
architecture_judgement:
  applicability: applicable | not_applicable
  summary: {one sentence}
  risk: {non-empty string}
  tradeoffs: [{short text}]      # OPTIONAL — derived from SIMPLICITY findings
  alternatives_considered: [{short text}]  # REQUIRED — may be empty list
  spec_law_implications: {string} # OPTIONAL — derived from SPEC-LAW findings
  required_validation_consistency:
    status: pass | caution | fail | unknown  # MUST equal validation.status
validation:
  # validation.status: pass | caution | fail | unknown — single source of truth verdict
  status: pass | caution | fail | unknown   # single source of truth verdict
  blockers:
    # rq-fixWorkflowReliabilityDefects/AC13: design-validation blockers MUST be
    # typed objects in scope. Each blocker requires finding, source, approved
    # contract_ids (referencing items on the change's approved contract),
    # scope: "in_scope", and concrete in_scope_remediation. Out-of-scope
    # alternatives (e.g. changes to another repository, unactionable
    # recommendations) belong only in architecture_judgement.alternatives_considered.
    - finding: {string}
      source: {label, locator, summary}
      contract_ids: [{string}]   # MUST reference items on the change's contract
      scope: "in_scope"
      in_scope_remediation: {string}
  notes: {string}
recommendation: {one paragraph}

RESEARCHER VERDICT CROSSWALK:
  validation.status pass + CONCERNS absent → display "Validated"
  validation.status caution → display "Caution"
  validation.status fail → display "Anti-Pattern"   # advisory-only, not gate-blocking
  validation.status unknown → display "Needs More Info"

BUDGET: Focus on the 4 dimensions only. Do not rewrite the design.
STOP_WHEN: Architecture Judgement is complete with evidence for each dimension.
EXPECTED OUTPUT: call adv_subagent_report_submit with RESEARCHER_REPORT per .opencode/agents/adv-researcher.md (architecture_judgement is required).
```

Researcher `fail` is advisory-only — it surfaces `architecture_judgement.risk` and `validation.status: fail` but MUST NOT auto-block the design gate. Other gates may apply (e.g. contract compromise, security/release blockers).

### Validator scope enforcement (AC13)

The validator cannot classify out-of-scope alternatives as blockers or otherwise halt the design gate. Enforced boundaries:

- `validation.status: fail` is **advisory-only**. It never holds or completes the gate. Pause only for independently established contract compromise, security/release blocker, or user-discovered cross-validation `CONFLICT`.
- Every blocker row on a `researcher:design-validation` report MUST be an in-scope typed object: `finding`, `source`, approved `contract_ids[]` (must reference items on the change's contract), `scope: "in_scope"`, and `in_scope_remediation`. Malformed blocker authority (missing fields, scope ≠ `"in_scope"`, or unknown contract IDs) is rejected by `adv_subagent_report_submit` with `INVALID_REPORT` — no gate mutation, no auto-block.
- Out-of-scope alternatives (including changes to another repository, hand-wavy "consider rewriting", or recommendations that contradict the approved scope) belong only in `architecture_judgement.alternatives_considered`. They never promote to blocker status and never appear in `validation.blockers`.

When the validator wants to challenge the design, prefer `caution` with cited evidence, or surface a single typed blocker tied to a specific `contract_id` and `in_scope_remediation`. Anything beyond in-scope authority is rejected by ingest; routing it as blocker authority is structurally impossible.

---

## Phase 3.6: Handle Verdict

Process the validator output (crosswalking `validation.status` against the legacy verdict vocabulary) and determine whether to proceed:

| Verdict (`validation.status`)         | Legacy label    | Action                                                                                                                                                                                                                                          |
| ------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass` (no `CONCERNS`)                | `VALIDATED`     | Record "Validator: clean pass" in design notes; proceed to Phase 4                                                                                                                                                                              |
| `caution`                             | `CAUTION`       | Record caution findings in design notes; proceed to Phase 4                                                                                                                                                                                     |
| `fail`                                | `ANTI-PATTERN`  | Present `architecture_judgement.risk` findings; advisory-only — NEVER auto-block the design gate; record in design notes for surfacing; proceed to Phase 4 unless another gate blocker applies                                                |
| `unknown`                             | `NEEDS_MORE_INFO` | Record "Validation attempted but inconclusive" warning; proceed to Phase 4                                                                                                                                                                    |

Researcher `fail` / anti-pattern judgement is advisory-only in this change. It surfaces via `architecture_judgement.required_validation_consistency.status: fail` and does NOT add a new machine gate blocker.

Record the validation result via `adv_change_update design` as a compact summary appended to the design projection.

---

## Phase 4: Present Design Summary

Show a compact summary with:

- architecture overview
- key decisions
- implementation strategy
- major risks / tradeoffs
- optional visual comparison block when side-by-side design alternatives are easier to judge than prose alone. Load `skill("adv-user-intuit")` for the structured comparison presentation protocol if skill is available; otherwise continue with existing inline comparison workflow
- **Validator Result** — always display validator outcome from Phase 3.5/3.6 when validation data exists:
  - `validation.status: pass` (no `CONCERNS`) → one-line note: "Validator: clean pass ✓" (legacy label `VALIDATED`)
  - `validation.status: caution` → list caution findings inline (brief, one sentence each) (legacy label `CAUTION`)
  - `validation.status: fail` → show `architecture_judgement.risk` and `architecture_judgement.spec_law_implications` with unresolved items highlighted; mark advisory-only (legacy label `ANTI-PATTERN`)
  - `validation.status: unknown` → show warning: "Validation attempted but inconclusive" (legacy label `NEEDS_MORE_INFO`)
  - No validation data (legacy design with no validator markers) → omit section silently

After displaying the validator result:

- Visual comparison block: keep text-readable; align with inline choices.
- Real user-value tradeoffs → emit **Inline Approval prompt (Tier A)** before `/adv-prep`.
- Unresolved `CONFLICT` (user-discovered cross-validation conflict) → pause for user resolution before planning.
- Contract-compromise risk → always pause; surface route discussion before planning, any validator verdict.
- Straightforward design + no tradeoff + no unresolved `CONFLICT` + no contract-compromise risk + validator `pass`/`caution`/`unknown` → proceed to `/adv-prep`; no pause.
- Researcher `fail` judgement surfaces risk but MUST NOT auto-block the design gate; pause only if another gate blocker (contract compromise, security/release blocker, user-discovered `CONFLICT`) applies.

**Inline Approval prompt when pausing** (Tier A per `docs/command-voice-standard.md` § Inline Approval Voice):

After the spine footer line:

```
Reply `continue` to proceed, or reply with what to adjust.
```

**Reply parsing (Tier A):**

| Reply                                                                     | Action                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Tier A whitelist match (continue, go, approve, looks good, proceed, etc.) | Begin `/adv-prep` inline                                            |
| `/adv-prep {change-id}`                                                   | No-op; OpenCode dispatches                                          |
| `/adv-discover {change-id}` or `revisit discovery`                        | Halt design; user re-enters discovery                               |
| Free-form text                                                            | Treat as design revision; apply via `adv_change_update`, re-present |
| `cancel` / `stop`                                                         | Halt change                                                         |

**Anchor phrase:** "Reply `continue` to proceed, or reply with what to adjust."

### Phase 4.1: Contract-Compromise Risk Assessment (Inline)

Trigger: after reading agreement via `adv_change_show include.agreement`, the chosen design path can only work by violating its acceptance criteria, explicit constraints, or stated avoidances. Surface risk; do not silently proceed.

Unresolved `CONFLICT` + compromise risk → one combined user discussion.

**Assessment:**

1. Which AC/constraint/avoidance is at risk?
2. Is there another approach that preserves it?
3. Minimum viable scope if compromise accepted?

**Inline Approval prompt** (Tier A, with route options as inline reply choices):

After presenting the compromise analysis:

```
This design path requires compromising:
- {criterion / constraint / avoidance from agreement content returned as `_agreement`}
- {why no alternative preserves it}

Reply:
- `keep with compromise` — accept and amend `change.documents.agreement` via `adv_change_update agreement`, then proceed to /adv-prep
- `revise` (or describe the alternative) — agent finds an alternative path preserving all constraints
- `revisit discovery` (or `/adv-discover {change-id}`) — re-enter discovery to renegotiate scope or objectives
- `defer` — halt the change; this check resurfaces on resume
```

**Reply parsing (Tier A with route extension):**

| Reply                                                           | Action                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `keep with compromise` (or whitelist + explicit acknowledgment) | Amend `change.documents.agreement` via `adv_change_update agreement` (append "Design Compromise" section), then `/adv-prep` |
| `revise` or revision text                                       | Find alternative design preserving constraints; re-present                |
| `revisit discovery` or `/adv-discover {change-id}`              | Halt design; user re-enters discovery                                     |
| `defer` / `cancel` / `stop`                                     | Halt change; record reason in change notes                                |

**Amendment procedure for "keep with compromise":**

- `adv_change_update agreement` → append `Design Compromise` section to `change.documents.agreement`.
- Document compromised item, why unavoidable, approval evidence (reply text + timestamp).
- Proceed to `/adv-prep` only after persisted.

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
- Design artifact recorded
- Primary decisions documented
- Implementation strategy defined
- Validator result: {VALIDATED|CAUTION|CONFLICT|INCONCLUSIVE}

---

> **{change-id}**
> design ✓ → planning
>
> → `/adv-prep {change-id}`
```

**Auto-continue:** After gate completion, begin `/adv-prep` inline. Covers explicit approval and clean auto-pass. Do not ask "shall I proceed?" Approval/auto-pass is go-ahead.
