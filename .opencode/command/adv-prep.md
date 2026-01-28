---
name: adv-prep
description: Pre-implementation gap analysis using structured frameworks and cross-cutting concern checklists
agent: general
---

# ADV Prep - Pre-Implementation Gap Analysis

Analyze a change for gaps (missing scenarios, tasks, cross-cutting concerns) and add them using ADV tools. Uses the 4-Step Gap Analysis framework and IEEE-based completeness criteria.

> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers and CONTRACT STATUS blocks.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, select via the `question` tool

---

## Phase 1: Load Context

### Fetch Change Data

```
adv_change_show change_id: <target>
adv_task_list change_id: <target>
```

### Fetch Related Specs

```
adv_spec_list
```

For each capability affected by the change:
```
adv_spec_show capability: <name>
```

---

## Phase 2: Gap Analysis Framework

Use the **4-Step Gap Analysis**:
1. Define desired state (from change objectives)
2. Benchmark current state (from specs/codebase)
3. Analyze the gap (structured checklists below)
4. Compile action plan (tasks to add)

### Completeness Heuristics

Analysis is complete when:
- [ ] All requirements checked for scenarios
- [ ] Codebase searched for 3+ key terms
- [ ] 2+ libraries researched via Context7 (if applicable)
- [ ] All deployed specs scanned for conflicts
- [ ] Cross-cutting concerns checklist completed
- [ ] Task sequencing validated (absorption, TDD ordering, dependency coherence)

---

## Phase 3: Structured Gap Detection

### 3.1 Requirements Quality (INVEST Criteria)

For each requirement in change deltas, verify:

| Criterion | Check | Gap if Missing |
|-----------|-------|----------------|
| **I**ndependent | Self-contained? | "Decouple requirement from X" |
| **N**egotiable | Leaves solution flexibility? | "Clarify intent vs implementation" |
| **V**aluable | Delivers demonstrable value? | "Define user benefit" |
| **E**stimable | Can be sized? | "Break down into smaller pieces" |
| **S**mall | Fits in one iteration? | "Split into phases" |
| **T**estable | Can write test for it? | "Add acceptance scenario" |

### 3.2 Requirements Smell Detection

Scan for these smells indicating incomplete requirements:

| Smell | Pattern | Action |
|-------|---------|--------|
| Subjective | "user-friendly", "intuitive" | Add measurable criterion |
| Ambiguous | "quickly", "efficiently" | Specify metric |
| Superlative | "best", "most efficient" | Define baseline |
| Totality | "all", "every", "never" | Identify exceptions |
| Negative | "must not", "won't" | Convert to positive or add test |

**Flag gaps**: Vague criteria, untestable requirements.

### 3.3 Task Completeness

From `adv_task_list` output:
- Tasks atomic and verifiable?
- Tasks cover all requirements?
- Verification steps included?
- Dependencies explicit?

**Flag gaps**: Missing tasks, vague tasks, hidden dependencies.

### 3.3.1 Task Sequencing & Ordering (CRITICAL)

This analysis catches structural problems in how tasks are organized and ordered. These issues cause unnecessary rework, violate TDD, or create tasks that shouldn't exist independently.

#### A. Task Absorption Analysis

For each task, check whether it should be a **separate task** or **absorbed into another task**:

| Signal | Meaning | Action |
|--------|---------|--------|
| Task is a 3-5 line code change within a larger function | Not independently valuable | Absorb into parent task |
| Task describes a sub-behavior of another task's main function | Same concern, not separable | Absorb and update parent description |
| Task would require retrofitting if done after its dependency | Creates rework risk | Absorb into the dependency |
| Task adds cross-cutting behavior inconsistent with existing patterns | Following existing patterns is sufficient | Cancel with rationale |

**How to check**: For each task, search the codebase to understand the actual scope of the change. If the change is naturally part of another task's implementation (e.g., identity resolution naturally includes backfill-on-miss, service function naturally includes structured logging), it should be absorbed.

**Red flags that a task should be absorbed**:
- Task description starts with "Add X to Y" where Y is another task's output
- Task touches the same function/file as another task
- Task is blocked_by another task AND modifies the same code that task creates
- Completing the blocking task without this task would leave obviously incomplete code

**Action**: Cancel the absorbed task via `adv_task_update` and update the parent task's description to explicitly mention the absorbed behavior.

#### B. TDD Ordering Validation

Per the project's RSTC protocol (Requirement → Spec → Test → Code), test tasks MUST NOT be sequenced *after* implementation tasks as separate blocked dependencies.

**Anti-pattern to detect**:
```
tk-impl (implement feature) ──blocked_by──> tk-test (write tests)
```
This is CODE-FIRST, not TEST-FIRST. The test task depends on the implementation being done, which violates TDD.

**Correct pattern**: TDD red/green phases happen WITHIN each task, not across tasks. When executing `tk-impl`, the agent writes the test first (red phase), then implements (green phase), then marks complete.

**How to check**: Scan the dependency graph for any task with "test" or "unit test" or "integration test" in its title that is `blocked_by` an implementation task that covers the same scope. If found:
1. The test task should be MERGED into the implementation task
2. The implementation task's description should be updated to explicitly state "TDD: write tests first, then implement"
3. The test task should be cancelled with rationale

**Exception**: Integration tests that span multiple tasks (e.g., end-to-end tests that require multiple components to exist) are legitimate separate tasks. The key distinction is:
- **Merge**: "Unit tests for service X" blocked by "Implement service X" → merge
- **Keep separate**: "Integration test for full API flow" blocked by "Implement endpoint" AND "Register router" → keep as separate task

#### C. Dependency Graph Coherence

Review the full dependency graph for these structural issues:

| Issue | Detection | Fix |
|-------|-----------|-----|
| **Retrofit chains** | Task A creates code, Task B modifies that same code | Merge B into A |
| **Orphan branches** | Task has no dependents and doesn't contribute to a requirement | Cancel or connect |
| **False dependencies** | Task is `blocked_by` but could actually run in parallel | Remove blocking relationship |
| **Missing dependencies** | Task modifies code that another task creates, but no `blocked_by` | Add dependency or merge |
| **Diamond dependencies** | Two tasks independently modify same code area | Merge or sequence explicitly |

**Output**: For each issue found, produce a verdict with:
- Task IDs involved
- Evidence from the codebase (file paths, line numbers, existing patterns)
- Recommendation: Absorb / Merge / Cancel / Reorder / Keep as-is
- Rationale citing TDD protocol or separation of concerns

### 3.4 Cross-Cutting Concerns Checklist

For EVERY feature, check if these concerns are addressed:

| Concern | Questions | Gap Task Template |
|---------|-----------|-------------------|
| **Error Handling** | Failure scenarios? Recovery? | "Add error handling for X" |
| **Logging** | Audit trail? Debug info? | "Add structured logging for X" |
| **Validation** | Input/output verification? | "Add validation for X" |
| **Security** | Auth? AuthZ? Injection? | "Add security review for X" |
| **Performance** | Latency requirements? N+1? | "Add performance test for X" |
| **Caching** | Optimization opportunity? | "Evaluate caching for X" |
| **Config** | New options needed? | "Document config for X" |
| **Monitoring** | Health checks? Metrics? | "Add observability for X" |
| **Persistence** | Data storage implications? | "Define data model for X" |
| **Concurrency** | Thread safety? Race conditions? | "Add concurrency test for X" |
| **i18n/L10n** | Internationalization? | "Add i18n support for X" |
| **Privacy** | Data protection? GDPR? | "Review data handling for X" |

Document N/A with rationale for concerns that don't apply.

### 3.5 Codebase Impact

Search codebase for key terms. Compare with change's affected files.

**Flag gaps**: Missing files in scope, undiscovered dependencies.

### 3.6 Cross-Spec Consistency

Use `adv_spec_search` to find conflicts:
```
adv_spec_search keyword: <key-term-from-change>
```

**Flag gaps**: Conflicts, terminology inconsistencies, overlapping scope.

---

## Phase 4: Prioritize Gaps (MoSCoW)

Categorize each gap:

| Priority | Criteria | Action |
|----------|----------|--------|
| **Must** | Without it = failure | Add as blocking task |
| **Should** | Important, workarounds exist | Add as task |
| **Could** | Desirable, time permitting | Add as optional |
| **Won't** | Out of scope this time | Document in proposal.md |

---

## Phase 5: Contract Establishment

Generate contract from gap analysis:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Prepare {change-id} for implementation

SUCCESS CRITERIA:
- [ ] All requirements pass INVEST check
- [ ] No requirements smells remain
- [ ] Tasks cover all requirements
- [ ] Task sequencing is correct (no TDD inversions, no unnecessary splits)
- [ ] Cross-cutting concerns addressed
- [ ] No cross-spec conflicts
- [ ] adv_change_validate passes

GAPS TO FIX: {gap_count}
{for each gap, grouped by priority}

MUST:
- [ ] (G{n}) {gap description}

SHOULD:
- [ ] (G{n}) {gap description}

COULD:
- [ ] (G{n}) {gap description}

============================================================
```

**Proceed immediately** - `/adv-prep` invocation is implicit approval.

---

## Phase 6: Fix Gaps Using Tools

> **Anti-Loop Protocol**: After contract display, output:
> `>>> SYNTHESIS COMPLETE - FIXING GAPS <<<`
> Then immediately emit first tool call.

### For Missing Tasks

```
adv_task_add change_id: <target> title: "<task description>"
```

With dependencies:
```
adv_task_add change_id: <target> title: "<task>" blocked_by: ["<dep-task-id>"]
```

### For Task Sequencing Issues

**Absorbing/merging tasks**: When a task should be absorbed into another:
1. Cancel the absorbed task with rationale:
   ```
   adv_task_update task_id: "<absorbed-task-id>" status: "cancelled" notes: "Absorbed into <parent-task-id>: <rationale>"
   ```
2. Update the parent task description in `changes/<change-id>/change.json` to explicitly mention the absorbed behavior
3. Update any tasks that were `blocked_by` the cancelled task to point to the parent task instead

**Fixing TDD ordering**: When test tasks are incorrectly sequenced after implementation:
1. Cancel the separate test task:
   ```
   adv_task_update task_id: "<test-task-id>" status: "cancelled" notes: "Merged into <impl-task-id> for proper TDD sequencing"
   ```
2. Update the implementation task description to include "TDD: write failing tests first (red), then implement (green)"
3. Update any tasks that depended on the cancelled test task

### For Missing Scenarios

Add to change's spec deltas by editing `changes/<change-id>/change.json`:
- Add scenario objects to the deltas array
- Use proper ID format: `rq-{parent}.{n}`

### For Cross-Cutting Concerns

Either:
1. Add task: `adv_task_add ... title: "Add error handling for X"`
2. Or document N/A in proposal.md with rationale

### For Requirements Smells

Update the requirement text to be:
- Specific and measurable
- Positively framed
- Testable

### For Cross-Spec Conflicts

Document resolution in proposal.md:
- Align with existing spec, OR
- Document intentional override with rationale

---

## Phase 7: Progress Tracking

After EACH gap fix, emit status derived from work done:

```
---
CONTRACT STATUS:
{for each gap}
- [{fixed ? "x" : " "}] (G{n}) {gap}
  {if fixed} (evidence: {tool call or edit}){end}
{end}
Gaps: {fixed}/{total} | Priority: {must_done}/{must_total} MUST complete
---
```

---

## Phase 8: Validation

After all gaps fixed:

```
adv_change_validate change_id: <target> strict: true
```

If errors: fix and re-validate.

---

## Phase 9: Completion

### Verify Final State

```
adv_task_list change_id: <target>
adv_change_validate change_id: <target>
```

### Contract Fulfilled

```
============================================================
                  CONTRACT FULFILLED
============================================================

OBJECTIVE: Prepare {change-id} for implementation

ALL CRITERIA MET:
- [x] All requirements pass INVEST check
- [x] No requirements smells remain
- [x] Tasks cover all requirements
- [x] Task sequencing is correct (no TDD inversions, no unnecessary splits)
- [x] Cross-cutting concerns addressed
- [x] No cross-spec conflicts
- [x] adv_change_validate - PASSED

CHANGES MADE:
- Added {n} tasks via adv_task_add
- Absorbed/merged {n} tasks (sequencing fixes)
- Cancelled {n} tasks with rationale
- Added {n} scenarios to deltas
- Resolved {n} requirements smells
- Updated proposal.md with {n} notes

============================================================
```

### Completion Banner

```
============================================================
       /adv-prep {change-id} COMPLETE
============================================================
Result: {gap_count} gaps fixed, ready for /adv-apply
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Add task | `adv_task_add` |
| List specs | `adv_spec_list` |
| Show spec | `adv_spec_show` |
| Search specs | `adv_spec_search` |
| Validate | `adv_change_validate` |
