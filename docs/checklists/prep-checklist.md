# Prep Checklist

Referenced by `/adv-prep`. Enforces semantic validation before implementation begins.

---

## Requirement Specificity

Every requirement in change deltas MUST pass INVEST criteria:

- [ ] **Independent** — Self-contained, not coupled to other requirements
- [ ] **Negotiable** — Defines intent, not specific implementation
- [ ] **Valuable** — Delivers demonstrable user/system value
- [ ] **Estimable** — Can be sized for effort
- [ ] **Small** — Fits in one iteration
- [ ] **Testable** — Can write a failing test for it

### Requirements Smell Detection

Scan all requirement text for these smells:

| Smell | Pattern | Resolution |
|-------|---------|------------|
| Subjective | "user-friendly", "intuitive" | Add measurable criterion |
| Ambiguous | "quickly", "efficiently" | Specify metric or threshold |
| Superlative | "best", "most efficient" | Define baseline comparison |
| Totality | "all", "every", "never" | Identify exceptions |
| Negative | "must not", "won't" | Convert to positive or add explicit test |

**Gate blocker**: Any requirement with unresolved smells blocks the prep gate.

---

## Scenario Completeness

For each requirement, verify scenario coverage:

- [ ] **Happy path** — Primary success flow has a scenario
- [ ] **Error paths** — At least one failure scenario per requirement
- [ ] **Edge cases** — Empty, null, max values, boundary conditions
- [ ] **Given/When/Then** — All scenarios use structured format
- [ ] **Testable assertions** — "Then" clauses are concrete and verifiable

### Minimum Coverage

| Requirement Type | Minimum Scenarios |
|-----------------|-------------------|
| Simple (CRUD, config) | 2 (happy + one error) |
| Moderate (business logic) | 3 (happy + error + edge) |
| Complex (security, concurrency) | 4+ (happy + error + edge + adversarial) |

---

## Testability

Every scenario MUST be translatable to a test:

- [ ] **Deterministic** — Same input always produces same output
- [ ] **Observable** — Outcome can be verified programmatically
- [ ] **Isolated** — No hidden dependencies on external state
- [ ] **Automatable** — Can run in CI without manual intervention

**Red flags** (scenario is not testable):
- "Then the system feels responsive" (subjective)
- "Then performance improves" (no metric)
- "Then it works correctly" (circular)

---

## Scope Clarity

- [ ] **Explicit boundaries** — What is IN scope is listed
- [ ] **Explicit exclusions** — What is OUT of scope is documented
- [ ] **Affected files identified** — Codebase search performed for key terms
- [ ] **No scope creep** — Tasks align with stated requirements (no extras)
- [ ] **Cross-spec conflicts resolved** — `adv_spec_search` run, no contradictions

---

## Dependency Mapping

### Task Sequencing

- [ ] **No TDD inversions** — Test tasks are NOT blocked by implementation tasks (tests go WITHIN tasks via red/green phases)
- [ ] **No unnecessary splits** — Tasks that modify the same code are merged
- [ ] **No retrofit chains** — Task A creates code, Task B modifies same code => merge
- [ ] **No orphan branches** — Every task contributes to a requirement
- [ ] **No false dependencies** — `blocked_by` relationships are genuine

### Cross-Cutting Concerns

For every feature in the change, verify these are addressed (or explicitly marked N/A):

| Concern | Addressed? |
|---------|-----------|
| Error handling | [ ] Yes / [ ] N/A: _reason_ |
| Logging | [ ] Yes / [ ] N/A: _reason_ |
| Input validation | [ ] Yes / [ ] N/A: _reason_ |
| Security | [ ] Yes / [ ] N/A: _reason_ |
| Performance | [ ] Yes / [ ] N/A: _reason_ |
| Concurrency | [ ] Yes / [ ] N/A: _reason_ |
| Configuration | [ ] Yes / [ ] N/A: _reason_ |
| Observability | [ ] Yes / [ ] N/A: _reason_ |

---

## Completeness Heuristics

Analysis is complete when ALL of the following are true:

- [ ] All requirements checked against INVEST criteria
- [ ] Codebase searched for 3+ key terms from the change
- [ ] 2+ libraries researched via Context7 (if applicable)
- [ ] All deployed specs scanned for conflicts via `adv_spec_search`
- [ ] Cross-cutting concerns checklist completed
- [ ] Task sequencing validated (no inversions, no unnecessary splits)
- [ ] `adv_change_validate` passes in strict mode

**Gate blocker**: Prep gate cannot be marked complete until all heuristics are satisfied.
