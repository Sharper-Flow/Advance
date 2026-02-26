---
name: adv-prep
description: Analyze gaps and add missing scenarios, tasks, and dependencies
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

### Completed Tasks Are Draft Artifacts, Not Finalized (CRITICAL)

**MUST read before proceeding.** If the change already has tasks marked `done`, treat them as draft implementation that still requires gap analysis. Agents sometimes skip ahead to implementation before prep runs; this is expected and recoverable.

**You MUST:**
1. Load ALL tasks via `adv_task_list` (including done tasks) and review what was already built
2. Run the full gap analysis across the entire change — evaluate every task, requirement, and cross-cutting concern, even for completed work
3. Add targeted reconciliation tasks where gaps are found in completed work (e.g., "Add missing error handling to X", "Write tests for Y", "Add scenario for Z")
4. Never skip a gap check because "that part is already done"

**You MUST NOT:**
- Rubber-stamp completed tasks as gap-free without actually analyzing them
- Reopen or revert completed tasks — instead, add new follow-up tasks where gaps are found

### Fetch Change Data

```
adv_change_show changeId: <target>
adv_task_list changeId: <target>
```

### Doctor-Lite Check: Cross-Repo Routing Metadata

Before gap analysis, run a lightweight integrity check over tasks for cross-repo routing completeness:

- If `target_repo` is set and `target_path` is missing → emit a must-fix finding
- If `target_path` is set and `target_repo` is missing → emit a must-fix finding
- If task title suggests cross-repo work (backend/api/db/migrations/path hints) but both fields are missing → emit a warning

These findings should be surfaced in prep output and converted into explicit follow-up tasks when appropriate.

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
- [ ] Cross-repo routing validated (all external tasks have target_repo/target_path)

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

**Action**: Cancel the absorbed task via `adv_task_cancel` (with user approval) and update the parent task's description to explicitly mention the absorbed behavior.

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

Use `adv_spec` search to find conflicts:
```
adv_spec action: "search" query: <key-term-from-change>
```

**Flag gaps**: Conflicts, terminology inconsistencies, overlapping scope.

### 3.7 Cross-Repo Routing Validation

If the change involves tasks targeting external repositories:

#### Check 1: Task Routing Metadata

For each task, determine if it targets an external repo by checking:
- `target_repo` or `target_path` fields in task metadata
- Task title containing repo hints (e.g., `[backend]`, `[db]`, `~/dev/...`)
- Proposal.md "Related Repositories" section listing external repos

**Flag as MUST gap** if:
- A task mentions another repo in its title but lacks `target_repo`/`target_path` metadata
- The proposal mentions cross-repo changes but no tasks have routing metadata

#### Check 2: Related Repos Config

If any task targets an external repo:
1. Check if `project.json` has `related_repos` configured
2. If not, flag as **SHOULD** gap: "Add related_repos config to project.json for cross-repo routing"
3. Verify each `target_repo` value maps to a valid entry in `related_repos`

#### Check 3: Routing Completeness

For each external repo mentioned in the proposal:
- Verify at least one task targets that repo
- Flag as **MUST** gap if a repo is mentioned but has no corresponding tasks

**Gap Task Templates:**
- "Add target_repo metadata to task {task.id} (targets {repo})"
- "Add related_repos config to project.json: { id: '{id}', path: '{path}' }"
- "Create task for {repo} changes described in proposal (currently missing)"

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
adv_task_add changeId: <target> content: "<task description>"
```

With dependencies:
```
adv_task_add changeId: <target> content: "<task>" blockedBy: ["<dep-task-id>"]
```

### For Task Sequencing Issues

**Absorbing/merging tasks**: When a task should be absorbed into another:
1. Present the proposed cancellation to the user via the `question` tool with per-task reasons, then call `adv_task_cancel` only after receiving explicit approval:
   ```
   # Step 1: Ask user via question tool — show each task and reason
   # Step 2: On approval:
   adv_task_cancel taskIds: ["<absorbed-task-id>"] reasons: { "<id>": "Absorbed into <parent-task-id>: <rationale>" } approvedByUser: true approvalEvidence: "User approved via question tool"
   ```
2. Update the parent task description in `changes/<change-id>/change.json` to explicitly mention the absorbed behavior
3. Update any tasks that were `blocked_by` the cancelled task to point to the parent task instead

**Fixing TDD ordering**: When test tasks are incorrectly sequenced after implementation:
1. Present to user via question tool with reason, then cancel on approval:
   ```
   adv_task_cancel taskIds: ["<test-task-id>"] reasons: { "<id>": "Merged into <impl-task-id> for proper TDD sequencing" } approvedByUser: true approvalEvidence: "User approved via question tool"
   ```
2. Update the implementation task description to include "TDD: write failing tests first (red), then implement (green)"
3. Update any tasks that depended on the cancelled test task

### For Missing Scenarios

Add to change's spec deltas by editing `changes/<change-id>/change.json`:
- Add scenario objects to the deltas array
- Use proper ID format: `rq-{parent}.{n}`

### For Cross-Cutting Concerns

Either:
1. Add task: `adv_task_add ... content: "Add error handling for X"`
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
adv_change_validate changeId: <target> strict: true
```

If errors: fix and re-validate.

---

## Phase 8.5: Readiness Report

After validation passes, run the prep gate to get a machine-enforced readiness check:

```
adv_gate_complete changeId: <target> gateId: prep
```

### On Must-Failures (gate blocked)

The response will include `readinessFailures[]` — each with a `code`, `message`, `path`, and `remediation` hint.

For each must-failure, take the indicated remediation action before continuing:

| Failure Code | Cause | Remediation |
|---|---|---|
| `SCENARIO_MISSING` | A delta requirement has no scenarios | Add at least one Given/When/Then scenario to the requirement |
| `TASK_TDD_INVERSION` | Test task is blocked_by an impl task | Reverse the dependency (impl should block_by test, not vice versa) |
| `CROSS_REPO_MISSING_METADATA` | Task has target_repo XOR target_path | Set both `target_repo` AND `target_path` on the task |

After fixing, re-run `adv_gate_complete changeId: <target> gateId: prep` to confirm the gate passes.

### On Warnings Only (gate passes)

The response may include `readinessWarnings[]` — advisory items that do not block. Surface these to the user as follow-up items (smell improvements, orphan task review, unrouted cross-repo hints) but do NOT block on them.

### On Clean Pass (no issues)

Gate completes immediately. Proceed to Phase 9.

---

## Phase 9: Completion

### Verify Final State

```
adv_task_list changeId: <target>
adv_change_validate changeId: <target>
```

### Mark Prep Gate

Mark the prep gate as complete (if not already marked in Phase 8.5):

```
adv_gate_complete changeId: {change-id} gateId: prep
```

> **Note:** If Phase 8.5 already successfully completed the prep gate, this step is a no-op — the gate is already marked done.

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
- [x] adv_gate_complete prep - PASSED (readiness checks cleared)

CHANGES MADE:
- Added {n} tasks via adv_task_add
- Absorbed/merged {n} tasks (sequencing fixes)
- Cancelled {n} tasks with rationale
- Added {n} scenarios to deltas
- Resolved {n} requirements smells
- Updated proposal.md with {n} notes

GATE STATUS:
- Prep gate: COMPLETE ✓

============================================================
```

### Completion Banner

```
============================================================
       /adv-prep {change-id} COMPLETE
============================================================
Result: {gap_count} gaps fixed, ready for /adv-apply
Prep Gate: MARKED COMPLETE

  ⚡ Recommended next step (Build agent):
     /adv-apply {change-id}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Add task | `adv_task_add` |
| Cancel tasks (requires user approval) | `adv_task_cancel` |
| List specs | `adv_spec_list` |
| Show spec | `adv_spec_show` |
| Search specs | `adv_spec_search` |
| Validate | `adv_change_validate` |
| Prep gate readiness | `adv_gate_complete gateId: prep` |
