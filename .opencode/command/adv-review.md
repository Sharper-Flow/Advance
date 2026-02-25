---
name: adv-review
description: Post-implementation code review using structured dimensions and conventional comment labeling
agent: general
---

# ADV Review - Post-Implementation Code Review

Orchestrate a multi-dimensional code review using sub-agents. Uses the 12-dimension review framework and conventional comment labeling for actionable feedback.

> **SUB-AGENT CONTEXT**: Return findings as structured JSON. Skip status markers.
>
> **CHECKLIST**: Follow [docs/checklists/review-checklist.md](../../docs/checklists/review-checklist.md) for minimum findings enforcement.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, auto-select if one, else use the `question` tool

---

## Phase 1: Pre-flight

### Load Change Context

```
adv_change_show change_id: <target>
adv_task_list change_id: <target>
```

### Verify Implementation Exists

From `adv_task_list`: Check tasks are "done".

**If no implementation:**
```
No implementation found. Run /adv-apply {change-id} first.
```
Stop execution.

### Gate Prerequisite Check

```
adv_gate_status changeId: {change-id}
```

**If implementation gate is NOT complete (status != 'done' and status != 'legacy'):**

```
============================================================
            REVIEW BLOCKED - PREREQUISITE GATE INCOMPLETE
============================================================

The implementation gate must be completed before running review.

GATE STATUS:
- [ ] Implementation: {status}

REQUIRED ACTION:
Run /adv-apply {change-id} to complete implementation and mark the gate.

============================================================
```
Stop execution.

### Cancellation & Cross-Repo Audit

Before proceeding to code review, audit all cancelled and cross-repo tasks:

**Step 1: Check for unapproved cancellations**

From `adv_task_list`, find all tasks with `status: "cancelled"`.
For each, verify `task.cancellation.approved_by_user === true`.

**If ANY cancelled task lacks approval metadata:**

```
============================================================
        REVIEW BLOCKED - UNAPPROVED CANCELLATIONS
============================================================

The following cancelled tasks lack user approval records:

{for each unapproved task}
- {task.id}: {task.title}
  Status: cancelled (NO APPROVAL RECORD)
{end}

REQUIRED ACTION:
Re-open these tasks and complete them, or obtain user approval
via adv_task_cancel before re-running /adv-review.

============================================================
```
Stop execution.

**Step 2: Check cross-repo task completion**

For tasks with `target_repo` or `target_path` set:
1. Verify the task status is `done` (not just `in_progress` or `pending`)
2. If a cross-repo task is cancelled, verify it has approval metadata (covered by Step 1)

**If ANY cross-repo task is incomplete (not done or approved-cancelled):**

```
============================================================
        REVIEW BLOCKED - INCOMPLETE CROSS-REPO TASKS
============================================================

The following cross-repo tasks are not completed:

{for each incomplete cross-repo task}
- {task.id}: {task.title}
  Target: {target_repo} ({target_path})
  Status: {status}
{end}

REQUIRED ACTION:
Complete these tasks in their target repositories before review.
Use workdir to switch to the target repo and execute.

============================================================
```
Stop execution.

### Extract Review Context

From change data, extract:
- Affected files (from proposal.md)
- Spec scenarios (from deltas)
- Task completion evidence

---

## The 12-Dimension Review Framework

Structure review across these dimensions (from Google Engineering Practices):

| # | Dimension | Focus |
|---|-----------|-------|
| 1 | **Design** | Architecture, system integration, timing |
| 2 | **Functionality** | Does it work? Edge cases? Concurrency? |
| 3 | **Complexity** | Can it be understood quickly? Over-engineered? |
| 4 | **Tests** | Coverage, tests actually fail when code breaks |
| 5 | **Naming** | Clear, communicative, appropriate length |
| 6 | **Comments** | Explain "why" not "what" |
| 7 | **Style** | Conformance to style guide |
| 8 | **Documentation** | READMEs, API docs updated |
| 9 | **Security** | Auth, validation, secrets |
| 10 | **Performance** | Degradation risks, optimization opportunities |
| 11 | **Error Handling** | Correct approach, user-friendly, debuggable |
| 12 | **Consistency** | Matches existing patterns |

---

## Conventional Comment Labels

Every finding MUST use a severity label:

| Label | Meaning | Blocking? |
|-------|---------|-----------|
| `blocker:` | Must fix before merge | YES |
| `issue:` | Should fix, real problem | YES |
| `suggestion:` | Would improve code | NO |
| `nit:` | Minor style/preference | NO |
| `question:` | Need clarification | MAYBE |
| `praise:` | Good work worth noting | NO |

### Comment Structure

Every comment follows: **What** + **Why** + **How** (optional)

```
blocker: [file:line] Input not validated before SQL query
  Why: Allows SQL injection attacks
  Fix: Use parameterized query or input sanitization
```

---

## Phase 2: Spawn Analysis Sub-Agents

Spawn **4 parallel sub-agents** using Task tool with `subagent_type: "explore"`:

### Sub-Agent 1: Requirement Traceability

```
Analyze REQUIREMENT TRACEABILITY for change: {change-id}

Context:
- Affected files: {files}
- Scenarios: {scenario_titles}

Task:
1. For each scenario, search files for implementation evidence
2. Calculate coverage: traced/total * 100
3. Flag UNTRACED scenarios

Return JSON:
{
  "dimension": "requirement_traceability",
  "coverage_percent": N,
  "traced": [...],
  "untraced": [...],
  "issues": []
}
```

### Sub-Agent 2: Logic & Edge Cases

```
Analyze LOGIC for change: {change-id}

Context:
- Affected files: {files}

Check for:
- Off-by-one errors
- Null/undefined handling
- Boolean logic errors
- Unreachable code
- Edge cases (empty, zero, max values)
- Concurrency issues

Return JSON:
{
  "dimension": "logic_review",
  "issues": [{
    "label": "blocker|issue|suggestion",
    "category": "logic|edge_case|null_handling",
    "file": "...",
    "line": N,
    "what": "...",
    "why": "...",
    "fix": "..."
  }],
  "edge_cases_checked": {...}
}
```

### Sub-Agent 3: Security

```
Analyze SECURITY for change: {change-id}

Context:
- Affected files: {files}

Check (OWASP-based):
- A01: Broken Access Control
- A02: Cryptographic Failures (sensitive data exposure)
- A03: Injection (SQL, command, XSS)
- A04: Insecure Design
- A05: Security Misconfiguration
- A06: Vulnerable Components
- A07: Auth Failures
- A08: Data Integrity Failures
- A09: Logging Failures
- A10: SSRF

Return JSON:
{
  "dimension": "security_review",
  "issues": [{
    "label": "blocker|issue|suggestion",
    "owasp": "A01-A10",
    "file": "...",
    "line": N,
    "what": "...",
    "why": "...",
    "fix": "..."
  }],
  "auth_assessment": {...},
  "secrets_scan": {...}
}
```

### Sub-Agent 4: Architecture & Quality

```
Analyze ARCHITECTURE and CODE QUALITY for change: {change-id}

Context:
- Affected files: {files}
- Project patterns: Check AGENTS.md if exists

Check:
- Pattern conformance
- Module boundaries respected
- Naming conventions
- Complexity (functions > 50 lines, cyclomatic > 10)
- DRY violations (duplicated code)
- SOLID principle violations

Return JSON:
{
  "dimension": "architecture_conformance",
  "issues": [{
    "label": "issue|suggestion|nit",
    "category": "complexity|naming|duplication|solid",
    "file": "...",
    "line": N,
    "what": "...",
    "why": "...",
    "fix": "..."
  }],
  "complexity_hotspots": [...],
  "praise_worthy": [...]
}
```

### Sub-Agent 5: Cross-Repo Verification

```
Verify cross-repo tasks for change: {change-id}

Context:
- Affected files: {files}
- Tasks with target_repo or target_path

Check:
- All tasks with target_repo are in the 'done' state
- All tasks with target_path are in the 'done' state
- All cancelled tasks have approval metadata

Return JSON:
{
  "dimension": "cross_repo_verification",
  "status": "passed|failed",
  "missing_tasks": [...],
  "unapproved_cancellations": [...],
  "issues": []
}
```

---

## Phase 3: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Immediately aggregate issues. Skip prose summaries.

### Aggregate Issues

1. Combine all issues from sub-agents
2. Group by label: `blocker` > `issue` > `suggestion` > `nit`
3. Deduplicate (same file:line from multiple scanners)
4. Cross-reference with spec scenarios

### Minimum Findings Enforcement

Count non-nit findings (`blocker:`, `issue:`, `suggestion:`, `question:`).

**If >= 3 non-nit findings**: Proceed to verdict.

**If < 3 non-nit findings**: The review MUST include a genuinely-clean justification with file-level evidence per [review-checklist.md](../../docs/checklists/review-checklist.md). Without this justification, the review gate cannot be marked complete.

### Determine Verdict

| Verdict | Criteria |
|---------|----------|
| **BLOCKED** | Any `blocker:` findings |
| **CHANGES_REQUESTED** | Any `issue:` findings (no blockers) |
| **APPROVED** | Only `suggestion:` / `nit:` / none (with justification if < 3 non-nit) |

### The Approval Threshold

Approve when the change "definitely improves overall code health," even if imperfect.

**Block only on:**
- Security vulnerabilities
- Correctness bugs
- Code that degrades system health
- Missing tests for risky changes

**Don't block on:**
- Personal style preferences not in style guide
- Minor optimizations that aren't critical
- "Better" ways that are equivalent

---

## Phase 4: Display Summary

```
============================================================
              CODE REVIEW: {change-id}
============================================================

REQUIREMENT TRACEABILITY                    [{status}]
  Coverage: {percent}% ({traced}/{total})

LOGIC REVIEW                                [{status}]
  Issues: {count} ({blocker} blocker, {issue} issue)

SECURITY REVIEW                             [{status}]
  Concerns: {count}

ARCHITECTURE & QUALITY                      [{status}]
  Violations: {count}
  {if praise} Praise: {praise_items} {end}

------------------------------------------------------------
SEVERITY BREAKDOWN:
  blocker: {count} (blocks approval)
  issue: {count} (requires changes)
  suggestion: {count} (recommended)
  nit: {count} (optional)

VERDICT: [{verdict}]
============================================================
```

---

## Phase 5: Remediation (If Issues Found)

### If APPROVED

Skip to completion.

### If CHANGES_REQUESTED or BLOCKED

Use the `question` tool:
```json
{
  "questions": [{
    "header": "Fix Issues",
    "question": "Found {count} issues. How to proceed?",
    "options": [
      { "label": "Fix blockers+issues (Recommended)", "description": "Address all blocking items" },
      { "label": "Fix blockers only", "description": "Minimum to unblock" },
      { "label": "Show report only", "description": "Review findings, fix manually" },
      { "label": "Accept current state", "description": "Proceed without fixes" }
    ]
  }]
}
```

### If Fixing

Establish fix contract:
```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Fix code review issues in {change-id}

SUCCESS CRITERIA:
{for each blocker/issue to fix}
- [ ] (F{n}) {label}: {what} - {file}:{line}
{end}
- [ ] All fixes verified

============================================================
```

Spawn fix sub-agents with `subagent_type: "general"` for each issue.

After fixes, verify and update status.

---

## Phase 6: Final Report

### Mark Review Gate (if APPROVED)

If verdict is APPROVED, mark the review gate as complete:

```
adv_gate_complete changeId: {change-id} gateId: review
```

### Final Report Display

```
============================================================
              CODE REVIEW: {change-id}
============================================================

VERDICT: [{verdict}]

{for each dimension}
{DIMENSION}                                 [{status}]
  {summary}
  {if issues}
  - {top 3 issues with labels}
  {end}
{end}

------------------------------------------------------------
REVIEW COMMENTS:
{for each issue, sorted by severity}
{n}. {label}: {file}:{line}
    What: {what}
    Why: {why}
    {if fix}Fix: {fix}{end}
{end}

{if praise_items}
------------------------------------------------------------
POSITIVE NOTES:
{for each praise}
- {praise}: {file} - {why it's good}
{end}
{end}

{if fixes applied}
------------------------------------------------------------
FIXES APPLIED:
{for each fix}
- [{verified ? "x" : " "}] {issue} - {status}
{end}

ROLLBACK: git checkout -- {files}
{end}

------------------------------------------------------------
{if APPROVED}
GATE STATUS:
- Review gate: COMPLETE ✓

NEXT STEPS: /adv-harden {change-id}
{else}
REMAINING: Fix issues, re-run /adv-review {change-id}
{end}
============================================================
```

### Emit REVIEW_FINDINGS Block

After the final report, always emit a `REVIEW_FINDINGS` block. This is consumed by `/adv-harden` to audit unresolved findings before allowing the harden gate to complete.

Emit this block **regardless of verdict** (APPROVED, CHANGES_REQUESTED, or BLOCKED):

```
REVIEW_FINDINGS:
change: {change-id}
verdict: {APPROVED|CHANGES_REQUESTED|BLOCKED}
reviewed_at: {ISO timestamp}
findings:
{for each finding with label blocker/issue/suggestion/question/nit, sorted by severity}
  - id: {dimension}-{n}
    label: {blocker|issue|suggestion|question|nit}
    file: {file}
    line: {N}
    what: {what}
    status: {unresolved|fixed|accepted_debt}
    fix_notes: {empty if unresolved; task ID or fix description if fixed; debt doc ref if accepted}
{end}
END_REVIEW_FINDINGS
```

**Rules for `status` field:**
- Set `status: unresolved` for all findings at time of review emission
- `/adv-harden` updates logical status by checking task notes for fix evidence
- If a finding was fixed during review remediation phase, set `status: fixed` and `fix_notes` to the task or description
- `nit:` findings always emit as `status: unresolved` but are excluded from harden blocking

**Store the REVIEW_FINDINGS block**: Record it in the review gate completion notes via:
```
adv_gate_complete changeId: {change-id} gateId: review completedBy: "agent — {verdict}; {finding_count} findings; REVIEW_FINDINGS emitted"
```

### Completion Banner

```
============================================================
       /adv-review {change-id} COMPLETE
============================================================
Result: {verdict} ({fix_count} fixes applied)
{if APPROVED}Review Gate: MARKED COMPLETE{end}

  ⚡ Recommended next step (Refine agent):
     /adv-harden {change-id}
============================================================
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It Fails | Fix |
|--------------|--------------|-----|
| **Perfection-seeking** | Delays progress | Seek "better" not "perfect" |
| **Style-only blocking** | Personal preference | Only block on style guide rules |
| **Missing "why"** | Not actionable, not learnable | Always explain reasoning |
| **Code vs person** | Creates defensiveness | Comment on code, not developer |
| **No positive feedback** | Discouraging | Include `praise:` for good work |

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Spawn analysis | Task tool (explore) |
| Spawn fixes | Task tool (general) |
