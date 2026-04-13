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
