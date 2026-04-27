# Proposal Checklist

Referenced by `/adv-proposal`. Enforces requirement quality before the proposal gate completes.

---

## INVEST Criteria

Every requirement MUST pass all 6 criteria:

| Criterion | Check | If Missing |
|-----------|-------|------------|
| **I**ndependent | Self-contained? | Decouple |
| **N**egotiable | Solution flexibility? | Focus on intent |
| **V**aluable | Demonstrable value? | State user benefit |
| **E**stimable | Can be sized? | Break down |
| **S**mall | Fits one iteration? | Split phases |
| **T**estable | Can write test? | Add scenario |

---

## Requirement Smell Detection

Flag and fix any of these patterns:

| Smell | Example | Fix |
|-------|---------|-----|
| Subjective | "user-friendly" | "Loads in <2s" |
| Ambiguous | "efficiently" | "Uses <100MB" |
| Superlative | "best performance" | "p95 <200ms" |
| Totality | "handles all errors" | List specific types |
| Negative only | "must not crash" | "Returns error code" |

---

## Knowledge Gap Analysis

After problem statement confirmation, verify:

- [ ] Codebase unknowns identified (unexamined code paths, patterns, conventions)
- [ ] Ecosystem unknowns identified (tool/library state, LBP alternatives per P27)
- [ ] Domain unknowns identified (unstated business logic, user expectations)
- [ ] Integration unknowns identified (cross-system, API, active change interactions)
- [ ] Quick-check items resolved inline (spec lookups, codebase searches)
- [ ] Unresolved unknowns carried forward as Discovery Agenda items
- [ ] No recommendations made based on unverified assumptions

---

## Quality Gate

Before completing the proposal gate, verify:

- [ ] Each criterion is testable (no subjective language)
- [ ] Requirements are independent of each other
- [ ] Scope is achievable in one iteration
- [ ] Prior discussion decisions are reflected as constraints
- [ ] Rejected approaches are documented to prevent re-proposals
- [ ] Discovery Agenda present with unresolved unknowns (or explicitly empty with justification)
- [ ] `## Scope` section present with `### In Scope` and `### Out of Scope` subsections
- [ ] B/F/S ambiguity scan run with no CRITICAL findings

---

## Scope Section Requirement

Every proposal.md MUST contain a `## Scope` section with two subsections:

- `### In Scope` — enumerates what the change will address
- `### Out of Scope` — enumerates what the change explicitly will NOT address

**Gate blocking:** Proposal gate completion MUST be refused if either subsection is missing or empty.

**Backwards-compat:** If the proposal gate was already completed before this rollout (in-flight changes), skip re-evaluation. Detect via gate-state check — do not retroactively block legacy proposals.

---

## Ambiguity Scan (B/F/S)

Run a lightweight 3-category ambiguity scan during `/adv-proposal` Phase 2.6. Per UD2 hybrid scope: only B/F/S are required in `/adv-proposal`; M and optional categories (D/X/Q/I/E/C/T) are not run during proposal.

Uses finding shape from `ADV_INSTRUCTIONS.md § Ambiguity Taxonomy`:

```
{Letter}{N}  {SEVERITY}  {Category}  {Finding text}
  Evidence: {verbatim quote OR `(no {section} section)`}
  Reason: unclear because {X}
```

### Severity Rules

| ID | Severity | Category | Trigger |
|----|----------|----------|---------|
| B1 | CRITICAL | Boundaries | Missing `### Out of Scope` subsection |
| F1 | CRITICAL | Functional Scope | Missing or placeholder `## Success Criteria` section |
| S1 | HIGH | Completion Signals | Vague/unmeasurable success criteria (cite exact phrase) |

### Gate-Block Rule

- Any CRITICAL finding → block proposal gate completion (under `clarify_enforcement: strict`)
- Agent honor-system rule per KD1: × MUST NOT call `adv_gate_complete gateId: 'proposal'` if any CRITICAL finding exists
- Skip scan when `clarify_enforcement: 'off'`

× MUST NOT fabricate evidence quotes — every finding cites verbatim text from proposal.md or `(no {section} section)`.
