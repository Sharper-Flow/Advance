---
name: adv-prep
description: "Analyze gaps and synthesize tasks from validated research findings"
phaseGoal: "Complete the flight-check: every gap closed, every dependency mapped, every task ready — ready for autonomous implementation."
---

# ADV Prep — Pre-Implementation Gap Analysis

Analyze change for gaps (missing scenarios, tasks, cross-cutting concerns) → add them via ADV tools. Uses 4-Step Gap Analysis and IEEE completeness criteria. Runs **inline** — no sub-agents.

## Command Boundary

**Produces:** Complete task graph via `adv_task_add` (sole pre-impl task creator), gap analysis, task sequencing with dependencies.

**× MUST NOT:** Complete non-prep gates, make architecture decisions, modify problem statement/success criteria.

**Gate:** Completes `prep` only. `/adv-task` is exempt (fast-track bundles proposal+research+prep).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → select via `question` tool

---

## Phase 1: Load Context

### Completed Tasks = Draft Artifacts (CRITICAL)

If change has tasks marked `done`, treat as draft implementation requiring gap analysis. Agents sometimes skip ahead — this is expected and recoverable.

**MUST:** Load ALL tasks (including done) → run full gap analysis across entire change → add reconciliation tasks where gaps found in completed work.

**× MUST NOT:** Rubber-stamp completed tasks without analysis. × Reopen completed tasks — add new follow-up tasks instead.

### Fetch Data

`adv_change_show` + `adv_task_list` for target. Then `adv_spec action: "list"` + `adv_spec action: "show"` for each affected capability.

### Doctor-Lite: Cross-Repo Routing

Check tasks for routing completeness:
- `target_repo` set but `target_path` missing → must-fix
- `target_path` set but `target_repo` missing → must-fix
- Title suggests cross-repo but both missing → warning

---

## Phase 1.5: Task Synthesis (when task list empty)

If zero tasks AND research gate complete → synthesize task graph from the research findings, deltas, and proposal/problem context returned by `adv_change_show`. × Do not read `proposal.md` directly.

### Priority Order

1. **Architecture corrections** (DRIFTED/ANTI-PATTERN) → block feature tasks via `blocked_by`
2. **Core implementation** → derived from research, inline TDD, proper dependencies
3. **Cross-cutting concerns** → error handling, logging, validation (from Phase 3 checklist)
4. **Documentation** → spec updates, inline docs
5. **Verification** → cross-cutting tests, mark `metadata.tdd_intent: "separate_verification"`

If research gate also pending → warn: run `/adv-research` first. Proceed with proposal-level gap analysis only.

---

## Phase 2: Gap Analysis Framework

4-Step: define desired state → benchmark current → analyze gap → compile action plan.

### Completeness Heuristics

- [ ] All requirements checked for scenarios
- [ ] Codebase searched for 3+ key terms
- [ ] 2+ libraries researched via Context7 (if applicable)
- [ ] All deployed specs scanned for conflicts
- [ ] Cross-cutting concerns checklist completed
- [ ] Task sequencing validated (absorption, TDD ordering, dependency coherence)
- [ ] Cross-repo routing validated

---

## Phase 3: Structured Gap Detection

### 3.1 Requirements Quality (INVEST)

| Criterion | Check | Gap if Missing |
|-----------|-------|----------------|
| **I**ndependent | Self-contained? | Decouple from X |
| **N**egotiable | Leaves solution flexibility? | Clarify intent vs impl |
| **V**aluable | Demonstrable value? | Define user benefit |
| **E**stimable | Can be sized? | Break into smaller pieces |
| **S**mall | Fits one iteration? | Split into phases |
| **T**estable | Can write test? | Add acceptance scenario |

### 3.2 Requirements Smells

| Smell | Pattern | Action |
|-------|---------|--------|
| Subjective | "user-friendly" | Add measurable criterion |
| Ambiguous | "efficiently" | Specify metric |
| Superlative | "best" | Define baseline |
| Totality | "all", "never" | Identify exceptions |
| Negative | "must not" | Convert to positive or add test |

### 3.3 Task Completeness

From `adv_task_list`: tasks atomic? cover all requirements? verification steps? dependencies explicit?

### 3.3.1 Task Sequencing (CRITICAL)

#### A. Absorption Analysis

| Signal | Action |
|--------|--------|
| 3-5 line change within larger function | Absorb into parent |
| Sub-behavior of another task | Absorb, update parent description |
| Would require retrofitting after dependency | Absorb into dependency |
| Cross-cutting behavior matching existing patterns | Cancel with rationale |

Red flags: "Add X to Y" where Y is another task's output, touches same file, blocked_by AND modifies same code, blocking task would leave obviously incomplete code without this.

Action: `adv_task_cancel` (with approval) → update parent description → redirect dependents.

#### B. TDD Ordering

Inline TDD is default. Use `metadata.tdd_intent`:

| Value | Meaning | Evidence? |
|-------|---------|-----------|
| `inline` (or unset) | Red/green within task | Yes |
| `separate_verification` | Cross-cutting test | No |
| `not_applicable` | Non-code (docs, config) | No |

Anti-pattern: same-scope test task blocked_by impl task (code-first, not test-first). Fix: merge test into impl, cancel test task.

Exception: cross-cutting tests spanning multiple impl tasks → mark `separate_verification`.

#### C. Dependency Graph Coherence

| Issue | Detection | Fix |
|-------|-----------|-----|
| Retrofit chains | A creates code, B modifies same | Merge B into A |
| Orphan branches | No dependents, no requirement | Cancel or connect |
| False dependencies | blocked_by but could run parallel | Remove |
| Missing dependencies | Modifies code another creates, no blocked_by | Add or merge |
| Diamond dependencies | Two tasks modify same area | Merge or sequence |

### 3.4 Cross-Cutting Concerns

| Concern | Check | Gap Template |
|---------|-------|-------------|
| Error Handling | Failure scenarios? Recovery? | "Add error handling for X" |
| Logging | Audit trail? Debug info? | "Add structured logging for X" |
| Validation | Input/output verification? | "Add validation for X" |
| Security | Auth? AuthZ? Injection? | "Add security review for X" |
| Performance | Latency? N+1? | "Add performance test for X" |
| Caching | Optimization opportunity? | "Evaluate caching for X" |
| Config | New options needed? | "Document config for X" |
| Monitoring | Health checks? Metrics? | "Add observability for X" |
| Persistence | Data storage implications? | "Define data model for X" |
| Concurrency | Thread safety? Races? | "Add concurrency test for X" |
| i18n/L10n | Internationalization? | "Add i18n support for X" |
| Privacy | Data protection? GDPR? | "Review data handling for X" |

Document N/A with rationale for non-applicable concerns.

### 3.5 Codebase Impact

Search codebase for key terms → compare with affected files. Flag missing files, undiscovered dependencies.

### 3.6 Cross-Spec Consistency

`adv_spec action: "search" query: <term>` → flag conflicts, terminology inconsistencies, overlapping scope.

### 3.7 Cross-Repo Routing

**Check 1:** Task routing metadata — flag MUST gap if task mentions repo but lacks `target_repo`/`target_path`.

**Check 2:** Related repos config — verify `project.json` has `related_repos` if tasks target external repos.

**Check 3:** Routing completeness — every repo in proposal has ≥1 task targeting it.

---

## Phase 4: Prioritize Gaps (MoSCoW)

| Priority | Criteria | Action |
|----------|----------|--------|
| Must | Without it = failure | Blocking task |
| Should | Important, workarounds exist | Task |
| Could | Desirable, time permitting | Optional |
| Won't | Out of scope | Document in proposal.md |

---

## Phase 5: Contract & User Approval

### 5.1 Vision Document

Generate a compact vision banner (<30 lines) and present it **in chat only** (not stored as a file). Include:

```
╔══════════════════════════════════════════════════════════════════╗
║  PREP VISION — {change title}                                    ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  Objective: {1-line summary from problem statement}              ║
║                                                                  ║
║  Success Criteria:                                               ║
║    • {criterion 1}                                               ║
║    • {criterion 2}                                               ║
║    • ...                                                         ║
║                                                                  ║
║  Task Summary: {N} tasks ({M} ready, {K} blocked)                ║
║    • {highest priority task summary}                             ║
║    • {next priority task summary}                                ║
║    • ...                                                         ║
║                                                                  ║
║  Gaps Fixed: {count} (Must: {n}, Should: {n}, Could: {n})        ║
║                                                                  ║
║  HITL Boundary:                                                  ║
║    ✓ Proposal approved | ✓ Research approved | → PREP APPROVAL   ║
║    After this: autonomous implementation via /adv-apply          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 5.2 User Approval Gate

Present the vision document and ask for explicit approval via `question` tool:

- **Approve and continue** — user confirms the plan is ready for autonomous implementation
- **Request changes** — user wants modifications before approving (loop back to gap analysis)
- **Cancel** — user wants to abandon prep

If **Request changes**: collect feedback → loop back to Phase 4 (re-analyze gaps) → regenerate vision → re-ask.

If **Cancel**: stop immediately, do not complete prep gate.

**× MUST NOT proceed past Phase 5 without explicit user approval.** Invocation is NOT implicit approval — the prep gate is the last human checkpoint before autonomous execution.

---

## Phase 6: Fix Gaps

> Anti-Loop: after contract → `>>> SYNTHESIS COMPLETE - FIXING GAPS <<<` → first tool call.

- Missing tasks → `adv_task_add` (with `blockedBy` if needed)
- Absorption/merge → `adv_task_cancel` (with user approval) → update parent → redirect dependents
- TDD ordering → cancel test task → update impl task with "TDD: write tests first"
- Missing scenarios → document the gap in proposal/problem statement, add follow-up task(s), and stop for explicit delta editing support rather than writing `change.json` directly
- Cross-cutting → add task or document N/A
- Smells → record required wording changes in proposal/problem notes or add follow-up task(s); don't rewrite requirement text inline during prep
- Cross-spec conflicts → document resolution in proposal.md

---

## Phase 7: Progress Tracking

After EACH fix, emit CONTRACT STATUS: gap checkboxes with evidence, fixed/total count.

---

## Phase 8: Validation

`adv_change_validate changeId: <target> strict: true` → fix errors → re-validate.

---

## Phase 8.5: Readiness Report

`adv_gate_complete changeId: <target> gateId: prep userApproved: true`

| Result | Action |
|--------|--------|
| Must-failures | Fix per remediation hint → re-run gate |
| Warnings only | Surface as follow-up, don't block |
| Clean pass | Proceed to Phase 9 |

Failure codes: `SCENARIO_MISSING` → add Given/When/Then, `TASK_TDD_INVERSION` → merge test into impl, `CROSS_REPO_MISSING_METADATA` → set both fields.

---

## Phase 9: Completion

### Verify

`adv_task_list` + `adv_change_validate` for target.

### Readiness Self-Assessment

Agent self-evaluates confidence across: requirements clarity, technical approach, dependency knowledge, codebase context, edge cases, cross-cutting concerns.

For each gap: resolve inline (read code, query docs, ask specific question). Re-validate after resolving. If unresolvable alone → ask user a specific targeted question.

### Mark Gate

`adv_gate_complete changeId: {change-id} gateId: prep userApproved: true` (no-op if Phase 8.5 already passed).

### Completion

Emit CONTRACT FULFILLED banner: all criteria met, changes made (tasks added/absorbed/cancelled, scenarios, smells resolved), gate status.

```
/adv-prep {change-id} COMPLETE
Result: {gap_count} gaps fixed, ready for /adv-apply
Prep Gate: MARKED COMPLETE
Next: /adv-apply {change-id}
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Add task | `adv_task_add` |
| Cancel tasks | `adv_task_cancel` (requires user approval) |
| List/show/search specs | `adv_spec` |
| Validate | `adv_change_validate` |
| Prep gate | `adv_gate_complete gateId: prep userApproved: true` |
