---
name: adv-audit
description: Project-wide audit to detect spec/implementation drift, orphaned code, and conflicts
agent: general
---

# ADV Audit - Spec/Implementation Alignment Check

Orchestrate a multi-phase audit using sub-agents to detect drift between specs and implementation.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Parse `$ARGUMENTS` for:
- `capability`: Specific capability to audit (optional)
- `--json`: Output as JSON instead of text
- `--all`: Audit all capabilities (default if no target)

1. **If capability provided**: Audit only that capability
2. **If empty or --all**: Audit all specs

## Pre-flight Checks

### Verify Specs Exist

```
adv_spec_list
```

**If no specs found:**
```
No specs found. Create specs first or run /adv-proposal.
```
Stop execution.

### Check for Active Changes

```
adv_change_list
```

If active changes exist, warn:
```
Note: Active changes may affect audit accuracy.
Consider archiving completed changes first.
```

---

## Phase 1: Spawn Analysis Sub-Agents

Execute in stages due to dependencies:

**Stage 1**: Spec Parser (no dependencies)
**Stage 2**: Code Mapper + Conflict Detector (parallel, after Stage 1)  
**Stage 3**: Drift Scanner (after Code Mapper)

### Sub-Agent 1: Spec Parser

```
You are a SPECIFICATION PARSER for ADV audit.

SCOPE: {scope}

TASK:
1. For each capability, call adv_spec_show to get requirements
2. Extract all requirements with:
   - ID, title, normative language (MUST/SHOULD/MAY)
   - Scenarios with Given/When/Then
   - File references mentioned
3. Flag malformed specs (requirements without scenarios)

RETURN JSON:
{
  "dimension": "spec_parser",
  "requirements": [{
    "id": "rq-abc",
    "title": "...",
    "normative": "MUST",
    "scenarios": [...],
    "file_references": [...]
  }],
  "summary": {
    "total_requirements": N,
    "total_scenarios": N,
    "malformed": N
  }
}
```

### Sub-Agent 2: Code Mapper

```
You are a CODE MAPPER for ADV audit.

REQUIREMENTS: {from spec parser}

TASK:
1. For each requirement with file references, verify files exist
2. For requirements without references, infer from capability name
3. Build bidirectional map: spec -> code, code -> specs
4. Flag unmapped specs (no code found)

RETURN JSON:
{
  "dimension": "code_mapper",
  "mappings": [{
    "requirement_id": "rq-abc",
    "files": [{"path": "...", "exists": true, "confidence": "HIGH"}]
  }],
  "unmapped_requirements": [...],
  "missing_files": [...],
  "summary": {...}
}
```

### Sub-Agent 3: Drift Scanner

```
You are a DRIFT SCANNER for ADV audit.

MAPPINGS: {from code mapper}

TASK:
1. CONSTRAINT DRIFT: Compare spec values to code values
2. MISSING IMPLEMENTATION: Check scenario coverage
3. TEST-SPEC MISMATCH: Compare test assertions to spec assertions
4. NORMATIVE VIOLATIONS: Check MUST NOT constraints

SEVERITY:
- HIGH: MUST/SHALL violation, security issue
- MEDIUM: SHOULD violation, functional gap
- LOW: Minor inconsistency
- REVIEW: Needs human judgment

RETURN JSON:
{
  "dimension": "drift_scanner",
  "findings": [{
    "type": "constraint_drift",
    "severity": "HIGH",
    "requirement_id": "...",
    "spec_text": "...",
    "code_text": "...",
    "expected": "...",
    "actual": "..."
  }],
  "summary": {...}
}
```

### Sub-Agent 4: Conflict Detector

```
You are a CONFLICT DETECTOR for ADV audit.

REQUIREMENTS: {from spec parser}

TASK:
1. Cross-reference all requirements for contradictions
2. Check for overlapping scope (multiple specs for same code)
3. Find stale references (code that no longer exists)
4. Check internal consistency within each spec

RETURN JSON:
{
  "dimension": "conflict_detector",
  "conflicts": [{
    "type": "contradictory",
    "severity": "HIGH",
    "specs": ["...", "..."],
    "description": "..."
  }],
  "overlaps": [...],
  "summary": {...}
}
```

---

## Phase 2: Orphan Detection

After Code Mapper completes, identify orphaned code:

1. List source files not mapped to any spec
2. Filter by significance (>50 lines)
3. Exclude config, types, generated code

Build orphan list for report.

---

## Phase 3: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Proceed directly to aggregation.

### Aggregate Findings

Combine from all dimensions:
- Drift findings
- Conflicts
- Unmapped specs
- Orphaned code
- Malformed specs

### Determine Health Status

| Status | Criteria |
|--------|----------|
| **ALIGNED** | Zero HIGH findings, <3 orphans, zero conflicts |
| **DRIFT_DETECTED** | Any HIGH drift OR >3 orphans OR SHOULD violations |
| **MAJOR_DRIFT** | Any MUST/SHALL violation OR contradictory requirements |

---

## Phase 4: Remediation (Optional)

**If ALIGNED**: Skip to report.

**If DRIFT_DETECTED or MAJOR_DRIFT**: Use `mcp_question`:

```
header: "Fix Issues"
question: "Found {count} drift issues. How to proceed?"
options:
  - label: "Fix all"
  - label: "Fix high severity only"
  - label: "Report only"
  - label: "Accept current"
```

If fixing, establish contract and spawn fix sub-agents.

---

## Final Report

### Text Format (default)

```
============================================================
               PROJECT AUDIT REPORT
============================================================

SCOPE: {all | capability}
HEALTH: {ALIGNED | DRIFT_DETECTED | MAJOR_DRIFT}

SPECS AUDITED: N capabilities
REQUIREMENTS: M checked
SCENARIOS: K verified

DRIFT SUMMARY
------------------------------------------------------------
Constraint Drift: N issues
Missing Implementation: N issues
Test-Spec Mismatch: N issues
Stale References: N issues

{If ALIGNED}
All specifications align with implementation.

{If issues}
DETAILED FINDINGS
------------------------------------------------------------
{for each finding}
## DRIFT: {capability}/{requirement}
- Spec: "{spec_text}"
- Code: {actual}
- Evidence: {file:line}
- Severity: {severity}
- Action: {suggestion}
{end}

## CONFLICTS DETECTED
{list}

## ORPHANED CODE
{list}

RECOMMENDATIONS
------------------------------------------------------------
1. {priority action}
2. {next action}

============================================================
```

### JSON Format (if --json)

```json
{
  "health": "ALIGNED|DRIFT_DETECTED|MAJOR_DRIFT",
  "summary": {...},
  "drift": [...],
  "conflicts": [...],
  "orphans": [...],
  "recommendations": [...]
}
```

### Completion Banner

```
============================================================
      /adv-audit {scope} COMPLETE
============================================================
Result: {ALIGNED | N drift issues | Report only}
============================================================
```

---

## Key Tools

| Purpose | Tool |
|---------|------|
| List specs | `adv_spec_list` |
| Show spec | `adv_spec_show` |
| Search specs | `adv_spec_search` |
| List changes | `adv_change_list` |
