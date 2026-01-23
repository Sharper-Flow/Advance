---
name: adv-review
description: Post-implementation code review using structured dimensions and conventional comment labeling
agent: general
---

# ADV Review - Post-Implementation Code Review

Orchestrate a multi-dimensional code review using sub-agents. Uses the 12-dimension review framework and conventional comment labeling for actionable feedback.

> **SUB-AGENT CONTEXT**: Return findings as structured JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. **If $ARGUMENTS provided**: Use as change-id
2. **If empty**: Call `adv_change_list`, auto-select if one, else `mcp_question`

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

### Determine Verdict

| Verdict | Criteria |
|---------|----------|
| **BLOCKED** | Any `blocker:` findings |
| **CHANGES_REQUESTED** | Any `issue:` findings (no blockers) |
| **APPROVED** | Only `suggestion:` / `nit:` / none |

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

Use `mcp_question`:
```
header: "Fix Issues"
question: "Found {count} issues. How to proceed?"
options:
  - label: "Fix blockers and issues (Recommended)"
    description: "Address all blocking items"
  - label: "Fix blockers only"
    description: "Minimum to unblock"
  - label: "Show report only"
    description: "Review findings, fix manually"
  - label: "Accept current state"
    description: "Proceed without fixes"
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
NEXT STEPS: /adv-harden {change-id}
{else}
REMAINING: Fix issues, re-run /adv-review {change-id}
{end}
============================================================
```

### Completion Banner

```
============================================================
       /adv-review {change-id} COMPLETE
============================================================
Result: {verdict} ({fix_count} fixes applied)
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
