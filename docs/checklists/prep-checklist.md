# Prep Checklist

Referenced by `/adv-prep`. Enforces semantic validation before implementation begins.

> **Machine-Enforced Checks**: Items tagged with a check ID (e.g., `SCENARIO_MISSING`) are automatically enforced by `adv_gate_complete gateId: prep`. Must-failures block the gate; warnings are advisory only.

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

| Smell | Check ID | Pattern | Resolution |
|-------|----------|---------|------------|
| Subjective | `SMELL_SUBJECTIVE` | "easy", "simple", "user-friendly", "intuitive" | Add measurable criterion |
| Ambiguous | `SMELL_AMBIGUOUS` | "etc", "and/or", "various", "appropriate" | Specify metric or threshold |
| Superlative | `SMELL_SUPERLATIVE` | "best", "most efficient", "always" | Define baseline comparison |
| Totality | `SMELL_TOTALITY` | "all", "every", "none", "nobody" | Identify exceptions |
| Negative | `SMELL_NEGATIVE` | "not", "never", "without" | Convert to positive or add explicit test |

**Advisory**: Smell checks produce warnings (not must-failures). They do NOT block the prep gate but should be resolved where practical.

---

## Scenario Completeness

For each requirement, verify scenario coverage:

- [ ] **At least one scenario** `SCENARIO_MISSING` *(machine-enforced must — gate blocked if absent)* — Every added requirement must have at least one scenario
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

- [ ] **No TDD inversions** `TASK_TDD_INVERSION` *(machine-enforced must — gate blocked if present)* — Test tasks MUST NOT be blocked_by implementation tasks (tests go WITHIN tasks via red/green phases)
- [ ] **No unnecessary splits** — Tasks that modify the same code are merged
- [ ] **No retrofit chains** — Task A creates code, Task B modifies same code => merge
- [ ] **No orphan branches** `TASK_ORPHAN` *(machine-enforced warning)* — Every task should connect to others via dependencies or be a dependency of another task
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

### Cross-Repo Routing

For tasks targeting external repositories:

- [ ] **Both routing fields set** `CROSS_REPO_MISSING_METADATA` *(machine-enforced must — gate blocked if incomplete)* — Tasks with `target_repo` MUST also have `target_path`, and vice versa
- [ ] **Repo hint tasks routed** `CROSS_REPO_HINT_UNROUTED` *(machine-enforced warning)* — Tasks with `[repo-name]` or path hints in title should have routing metadata set
- [ ] **Related repos configured** — `project.json` has `related_repos` entries for each external repo referenced

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
- [ ] `adv_gate_complete gateId: prep` passes (no must-failures from machine-enforced checks)

**Gate blocker**: Prep gate cannot be marked complete until all heuristics are satisfied and `adv_gate_complete gateId: prep` returns success.

---

## Machine-Enforced Check IDs Reference

The following check IDs are enforced by the prep gate validator. Use these IDs to match tool output to checklist items:

| Check ID | Severity | Description |
|---|---|---|
| `SCENARIO_MISSING` | **must** | Added requirement has no scenarios |
| `TASK_TDD_INVERSION` | **must** | Test task is blocked_by an impl task |
| `CROSS_REPO_MISSING_METADATA` | **must** | Task has target_repo XOR target_path (not both) |
| `TASK_ORPHAN` | warning | Task has no deps and is not a dep of anything |
| `CROSS_REPO_HINT_UNROUTED` | warning | Title suggests cross-repo target but no routing metadata |
| `SMELL_SUBJECTIVE` | warning | Requirement title contains subjective language |
| `SMELL_AMBIGUOUS` | warning | Requirement title contains ambiguous scope |
| `SMELL_SUPERLATIVE` | warning | Requirement title contains superlative claims |
| `SMELL_NEGATIVE` | warning | Requirement title uses negative phrasing |
| `SMELL_TOTALITY` | warning | Requirement title uses totality claims |
