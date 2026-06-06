---
name: adv-design
description: Validate architecture decisions, produce implementation strategy, and present design for user review
---

<!-- manifest: adv-design · gate: design · requiresChangeId: true · prereqs: [adv-discover] · scope: reads[specs, proposal, codebase] · modifies[proposal] -->

# ADV Design — Produce the Design Artifact

Convert the confirmed agreement into a concrete technical design. Command completes the `design` gate and now prepares planning directly. Design may add design-derived technical criteria; it must not invent new user-facing acceptance criteria.

## Command Boundary

**Produces:** `design.md` covering architecture, key decisions, implementation strategy, Design-Derived Criteria, LBP analysis, and user-visible design summary needed before planning.

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
6. **Design-Derived Criteria** — technical budgets/limits created by the chosen architecture (performance, security, scale, migration, or operations)
7. **Risks and mitigations**

Criteria boundary:

- Design explains how discovery-approved AC/SC will be delivered.
- Design MAY add technical criteria that derive from architecture.
- Design MUST NOT invent new user-facing acceptance criteria.
- If design invalidates an approved AC/SC, treat discovery re-entry as routine: call `adv_change_reenter fromGate: "discovery"` with the criteria delta, then rerun discovery/design/prep. Do not silently rewrite agreement criteria in design.

<!-- rq-domainContextADR01 -->

> **ADR rubric (sparingly):** When recording a key decision, check the 3-criteria rubric: (1) hard-to-reverse, (2) surprising-without-context, (3) result-of-real-tradeoff. If all three are met, draft an ADR at `docs/adr/NNNN-slug.md` (numbering sequential, slug 3-5 hyphenated words). See `.adv/specs/domain-context/ADR-FORMAT.md` for format and `.adv/specs/domain-context/spec.json` (`rq-domainContextADR01`) for consumer contract. ADR drafts are advisory; they don't gate-block.

Keep the design actionable for `/adv-prep`; it should explain why the plan is correct, not what files exist.

---

## Phase 2.5: Design Leverage Scout

<!-- rq-designOpportunityScout01 -->

Run a mandatory bounded leverage-scout pass after draft design and before independent validation (Phase 3.5). The scout identifies leverage points: shortcuts, reusable components, parallelism opportunities, simplification paths, and cross-cutting improvements.

### Execution

1. **Prepare split-load contract** — orchestrator owns ScoutCandidate schema, routing taxonomy, fallback/degradation, adoption, and all ADV mutations. Do not load scout methodology into main context unless worker loading is unavailable.
2. **Prepare context** — assemble proposal summary, agreement objectives/AC/constraints/avoidances, draft design content (Phase 2 output), and prior-consideration data from discovery's conflict scan.
3. **Spawn adv-researcher** — prompt worker to load `skill("adv-opportunity-scout")` in `design` mode when available; otherwise use the embedded schema/routing summary in this command. The researcher returns ≤5 structured candidates (8-field ScoutCandidate schema).
4. **Sort candidates** — by payoff/risk ratio (highest first).
5. **Route adoption** per the skill's routing taxonomy:
   - **Auto-adopt** only when: contract-tied (not "untied"), low risk, `adopt_now`/`design_around` fate, no user-value tradeoff.
   - **Surface to user** for all other candidates (untied, medium+ risk, or user-value tradeoff).
6. **Integrate adopted findings** — auto-adopted candidates are incorporated into the design before the validator runs (Phase 3.5). The validator then validates the design including any adopted improvements.

### Opt-Out

The scout phase may be skipped with rationale for trivially scoped changes where the opportunity surface is likely zero. Record "Scout: skipped — {rationale}" in the phase output.

### Degradation

If worker skill-load is unavailable, adv-researcher spawn fails, returns empty/malformed output, or times out: record "Scout: inconclusive ({reason})" and proceed without blocking. Mandatory means "must attempt," not "must succeed."

### Output

- "Design Leverage Scout" section in design.md with: candidates considered (count), auto-adopted (count + summary), surfaced to user (count + summary), inconclusive/skipped (if applicable).

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

## Design-Derived Criteria

Technical criteria caused by the chosen architecture only; no new user-facing AC.

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
CHANGE: {change-id} | {title} | gate: design
SCOPE KEY: researcher:design-validation
ATTEMPT: {attempt-number, starting at 1 for this researcher worker}
TASK_SCOPE: validate the proposed design against agreement, specs, and external evidence
IN_SCOPE:
  - design.md, agreement objectives/AC/constraints/avoidances, relevant specs, official docs/examples
OUT_OF_SCOPE:
  - rewriting the design, adding unapproved scope, user-value tradeoff decisions
DONE_WHEN:
  - validator verdict and findings are supported by sources or explicit inconclusive notes
STOP_WHEN:
  - contract compromise, security/release blocker, or conflict requiring orchestrator decision
VERIFICATION:
  required_when_possible:
    - cite spec/doc/source evidence for each caution or conflict
  optional_additional_checks: true

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
EXPECTED OUTPUT: return DESIGN_VALIDATION and call adv_subagent_report_submit with RESEARCHER_REPORT per .opencode/agents/adv-researcher.md
```

---

## Phase 3.6: Handle Verdict

Process the validator output and determine whether to proceed:

| Verdict                               | Action                                                                                                                                                                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `VALIDATED`                           | Record "Validator: clean pass" in design notes; proceed to Phase 4                                                                                                                                                                               |
| `CAUTION`                             | Record caution findings in design notes; proceed to Phase 4                                                                                                                                                                                      |
| `CONFLICT`                            | Present conflict findings; attempt inline resolution if technical fix is obvious; if unresolved, flag in design notes for the design summary to surface to user before planning; if resolved inline, record the conflict as resolved and proceed |
| `INCONCLUSIVE` (empty/failed/timeout) | Record "Validation attempted but inconclusive" warning; proceed to Phase 4                                                                                                                                                                       |

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

- Visual comparison block: keep text-readable; align with inline choices.
- Real user-value tradeoffs → emit **Inline Approval prompt (Tier A)** before `/adv-prep`.
- Unresolved `CONFLICT` → pause for user resolution before planning.
- Contract-compromise risk → always pause; surface route discussion before planning, any validator verdict.
- Straightforward design + no tradeoff + no unresolved `CONFLICT` + no contract-compromise risk + validator `VALIDATED`/`CAUTION`/`INCONCLUSIVE` → proceed to `/adv-prep`; no pause.

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

| Reply                                                                     | Action                                                              |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Tier A whitelist match (continue, go, approve, looks good, proceed, etc.) | Begin `/adv-prep` inline                                            |
| `/adv-prep {change-id}`                                                   | No-op; OpenCode dispatches                                          |
| `/adv-discover {change-id}` or `revisit discovery`                        | Halt design; user re-enters discovery                               |
| Free-form text                                                            | Treat as design revision; apply via `adv_change_update`, re-present |
| `cancel` / `stop`                                                         | Halt change                                                         |

**Anchor phrase:** `Reply `continue``

### Phase 4.1: Contract-Compromise Risk Assessment (Inline)

Trigger: chosen design path can only work by violating agreement.md acceptance criteria, explicit constraints, or stated avoidances. Surface risk; do not silently proceed.

Unresolved `CONFLICT` + compromise risk → one combined user discussion.

**Assessment:**

1. Which AC/constraint/avoidance is at risk?
2. Is there another approach that preserves it?
3. Minimum viable scope if compromise accepted?

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

| Reply                                                           | Action                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `keep with compromise` (or whitelist + explicit acknowledgment) | Amend agreement.md (append "Design Compromise" section), then `/adv-prep` |
| `revise` or revision text                                       | Find alternative design preserving constraints; re-present                |
| `revisit discovery` or `/adv-discover {change-id}`              | Halt design; user re-enters discovery                                     |
| `defer` / `cancel` / `stop`                                     | Halt change; record reason in change notes                                |

**Amendment procedure for "keep with compromise":**

- `adv_change_update` → append `Design Compromise` section to agreement.md.
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

**Auto-continue:** After gate completion, begin `/adv-prep` inline. Covers explicit approval and clean auto-pass. Do not ask "shall I proceed?" Approval/auto-pass is go-ahead.
