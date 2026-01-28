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
- [x] Cross-cutting concerns addressed
- [x] No cross-spec conflicts
- [x] adv_change_validate - PASSED

CHANGES MADE:
- Added {n} tasks via adv_task_add
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
