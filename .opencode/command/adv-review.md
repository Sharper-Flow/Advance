---
name: adv-review
description: Post-implementation code review - spawn sub-agents for correctness, security, architecture analysis
agent: general
---

# ADV Review - Post-Implementation Code Review

Orchestrate a multi-dimensional code review using sub-agents. Change context from ADV tools; findings tracked via contract banners.

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

Return JSON:
{
  "dimension": "logic_review",
  "issues": [{severity, category, file, line, finding, suggestion}],
  "edge_cases_checked": {...}
}
```

### Sub-Agent 3: Security

```
Analyze SECURITY for change: {change-id}

Context:
- Affected files: {files}

Check:
- Auth/authz presence
- Input validation
- Secrets handling
- Data exposure

Return JSON:
{
  "dimension": "security_review",
  "issues": [{severity, category, file, line, finding, suggestion}],
  "auth_assessment": {...},
  "secrets_scan": {...}
}
```

### Sub-Agent 4: Architecture Conformance

```
Analyze ARCHITECTURE for change: {change-id}

Context:
- Affected files: {files}
- Project root: {path}

Check:
- Pattern conformance (AGENTS.md)
- Module boundaries
- Naming conventions
- Code organization

Return JSON:
{
  "dimension": "architecture_conformance",
  "issues": [{severity, category, file, line, finding, suggestion}],
  "god_files": [],
  "god_functions": []
}
```

---

## Phase 3: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Immediately aggregate issues. Skip prose summaries.

### Aggregate Issues

1. Combine all issues from sub-agents
2. Group by severity: CRITICAL > MAJOR > MINOR > INFO
3. Deduplicate (same file:line from multiple scanners)
4. Cross-reference with spec scenarios

### Determine Verdict

- **BLOCKED**: Any CRITICAL issues
- **CHANGES_REQUESTED**: Any MAJOR issues (no CRITICAL)
- **APPROVED**: Only MINOR/INFO (or none)

### Display Summary

```
============================================================
              CODE REVIEW: {change-id}
============================================================

REQUIREMENT TRACEABILITY                    [{status}]
  Coverage: {percent}% ({traced}/{total})

LOGIC REVIEW                                [{status}]
  Issues: {count} ({critical} critical, {major} major)

SECURITY REVIEW                             [{status}]
  Concerns: {count}

ARCHITECTURE CONFORMANCE                    [{status}]
  Violations: {count}

------------------------------------------------------------
SEVERITY BREAKDOWN:
  CRITICAL: {count} (blocks approval)
  MAJOR: {count} (requires changes)
  MINOR: {count} (recommended)
  INFO: {count} (suggestions)

VERDICT: [{verdict}]
============================================================
```

---

## Phase 4: Remediation (If Issues Found)

### If APPROVED

Skip to completion.

### If CHANGES_REQUESTED or BLOCKED

Use `mcp_question`:
```
header: "Fix Issues"
question: "Found {count} issues. How to proceed?"
options:
  - label: "Fix critical only"
  - label: "Fix critical and major"
  - label: "Show report only"
  - label: "Accept current state"
```

### If Fixing

Establish fix contract:
```
============================================================
                    CONTRACT ACTIVE
============================================================

OBJECTIVE: Fix issues in {change-id}

SUCCESS CRITERIA:
{for each issue to fix}
- [ ] (F{n}) {issue.finding} - {issue.file}:{issue.line}
{end}
- [ ] All fixes verified

============================================================
```

Spawn fix sub-agents with `subagent_type: "general"` for each issue.

After fixes, verify and update status.

---

## Phase 5: Final Report

```
============================================================
              CODE REVIEW: {change-id}
============================================================

VERDICT: [{verdict}]

{for each dimension}
{DIMENSION}                                 [{status}]
  {summary}
  {if issues}- {top issues}{end}
{end}

------------------------------------------------------------
REVIEW COMMENTS:
{for each issue, sorted by severity}
{n}. [{severity}] {file}:{line} - {finding}
   Suggestion: {suggestion}
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

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Spawn analysis | Task tool (explore) |
| Spawn fixes | Task tool (general) |
