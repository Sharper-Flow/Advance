---
name: adv-prep
description: Pre-implementation gap analysis - identify missing scenarios, tasks, and concerns using ADV tools
agent: general
---

# ADV Prep - Pre-Implementation Gap Analysis

Analyze a change for gaps (missing scenarios, tasks, cross-cutting concerns) and add them using ADV tools. Contract banners show progress; tools manage state.

> **SUB-AGENT CONTEXT**: Return findings directly. Skip status markers and CONTRACT STATUS blocks.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, select via `mcp_question`

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

## Phase 2: Gap Analysis

Analyze across these dimensions, building a numbered gap list.

**TERMINATION CRITERIA**: Analysis complete when:
1. All requirements checked for scenarios
2. Codebase searched for 3+ key terms
3. 2+ libraries researched via Context7 (if applicable)
4. All deployed specs scanned for conflicts

### 2.1 Acceptance Criteria Completeness

For each requirement in change deltas:
- Has testable success criteria?
- Has Given/When/Then scenario?
- Error cases documented?

**Flag gaps**: Missing scenarios, vague criteria.

### 2.2 Task Completeness

From `adv_task_list` output:
- Tasks atomic and verifiable?
- Tasks cover all requirements?
- Verification steps included?

**Flag gaps**: Missing tasks, vague tasks.

### 2.3 Cross-Cutting Concerns

| Concern | Check |
|---------|-------|
| Error Handling | Failure scenarios? |
| Logging | Structured logs? |
| Security | Auth, validation? |
| Config | New options? |
| Performance | Latency requirements? |

**Flag gaps**: Unaddressed concerns.

### 2.4 Codebase Impact

Search codebase for key terms. Compare with change's affected files.

**Flag gaps**: Missing files in scope.

### 2.5 Cross-Spec Consistency

Use `adv_spec_search` to find conflicts:
```
adv_spec_search keyword: <key-term-from-change>
```

**Flag gaps**: Conflicts, terminology inconsistencies.

---

## Phase 3: Contract Establishment

Generate contract from gap analysis:

```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Prepare {change-id} for implementation

SUCCESS CRITERIA:
- [ ] All requirements have scenarios
- [ ] Error cases documented
- [ ] Tasks cover all requirements
- [ ] Cross-cutting concerns addressed
- [ ] No cross-spec conflicts
- [ ] adv_change_validate passes

GAPS TO FIX: {gap_count}
{for each gap}
- [ ] (G{n}) {gap description}
{end}

============================================================
```

**Proceed immediately** - `/adv-prep` invocation is implicit approval.

---

## Phase 4: Fix Gaps Using Tools

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

### For Cross-Spec Conflicts

Document resolution in proposal.md:
- Align with existing spec, OR
- Document intentional override

---

## Phase 5: Progress Tracking

After EACH gap fix, emit status derived from work done:

```
---
CONTRACT STATUS:
{for each gap}
- [{fixed ? "x" : " "}] (G{n}) {gap}
  {if fixed} (evidence: {tool call or edit}){end}
{end}
Gaps: {fixed}/{total}
---
```

---

## Phase 6: Validation

After all gaps fixed:

```
adv_change_validate change_id: <target> strict: true
```

If errors: fix and re-validate.

---

## Phase 7: Completion

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
- [x] All requirements have scenarios
- [x] Error cases documented  
- [x] Tasks cover all requirements
- [x] Cross-cutting concerns addressed
- [x] No cross-spec conflicts
- [x] adv_change_validate - PASSED

CHANGES MADE:
- Added {n} tasks via adv_task_add
- Added {n} scenarios to deltas
- Updated proposal.md with {n} notes

============================================================
```

### Completion Banner

```
============================================================
      /adv-prep {change-id} COMPLETE
============================================================
Result: Spec ready for /adv-apply
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
