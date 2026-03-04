---
name: adv-audit
description: Detect drift between specs and current implementation
agent: general
---

# ADV Audit — Spec/Implementation Alignment Check

Orchestrate a multi-phase audit using sub-agents to detect drift between specs and implementation. Uses SonarQube-style quality gates for objective pass/fail criteria.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

Parse `$ARGUMENTS` for:
- `capability`: Specific capability to audit (optional)
- `--json`: Output as JSON instead of text
- `--all`: Audit all capabilities (default if no target)
- `--strict`: Apply strict quality gate (warnings become errors)

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

## Quality Gate Definition

Based on SonarQube best practices:

### Standard Gate

| Metric | Threshold | Meaning |
|--------|-----------|---------|
| Drift findings (HIGH) | 0 | No MUST/SHALL violations |
| Drift findings (MEDIUM) | ≤ 3 | Limited SHOULD violations |
| Orphaned code | ≤ 3 files | Minimal unmapped code |
| Spec conflicts | 0 | No contradictions |
| Coverage | ≥ 80% | Most requirements traced |

### Strict Gate (--strict)

| Metric | Threshold |
|--------|-----------|
| Drift findings (HIGH) | 0 |
| Drift findings (MEDIUM) | 0 |
| Orphaned code | 0 |
| Spec conflicts | 0 |
| Coverage | 100% |

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
3. Flag malformed specs:
   - Requirements without scenarios
   - Subjective language (smell detection)
   - Missing normative keywords

RETURN JSON:
{
  "dimension": "spec_parser",
  "requirements": [{
    "id": "rq-abc",
    "title": "...",
    "normative": "MUST|SHOULD|MAY",
    "scenarios": [...],
    "file_references": [...],
    "smells": []
  }],
  "summary": {
    "total_requirements": N,
    "total_scenarios": N,
    "malformed": N,
    "by_normative": {"MUST": N, "SHOULD": N, "MAY": N}
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
5. Calculate traceability coverage

RETURN JSON:
{
  "dimension": "code_mapper",
  "mappings": [{
    "requirement_id": "rq-abc",
    "files": [{"path": "...", "exists": true, "confidence": "HIGH|MEDIUM|LOW"}]
  }],
  "unmapped_requirements": [...],
  "missing_files": [...],
  "coverage_percent": N,
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

SEVERITY (based on normative language):
- HIGH: MUST/SHALL violation, security issue
- MEDIUM: SHOULD violation, functional gap
- LOW: MAY violation, minor inconsistency
- REVIEW: Needs human judgment

RETURN JSON:
{
  "dimension": "drift_scanner",
  "findings": [{
    "type": "constraint_drift|missing_impl|test_mismatch|normative_violation",
    "severity": "HIGH|MEDIUM|LOW|REVIEW",
    "requirement_id": "...",
    "normative": "MUST|SHOULD|MAY",
    "spec_text": "...",
    "code_text": "...",
    "expected": "...",
    "actual": "...",
    "file": "...",
    "line": N
  }],
  "summary": {
    "high": N,
    "medium": N,
    "low": N,
    "review": N
  }
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
5. Detect terminology inconsistencies

RETURN JSON:
{
  "dimension": "conflict_detector",
  "conflicts": [{
    "type": "contradictory|overlapping|stale|terminology",
    "severity": "HIGH|MEDIUM",
    "specs": ["...", "..."],
    "description": "...",
    "resolution_hint": "..."
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
3. Exclude: config, types, generated code, test utilities
4. Categorize:
   - **Undocumented feature**: Works, no spec
   - **Dead code**: Unreachable, deletable
   - **Infrastructure**: Utilities, shared code

Build orphan list for report.

---

## Phase 3: Synthesis

> **Anti-Loop Protocol**: After sub-agents return:
> `>>> SYNTHESIS COMPLETE <<<`
> Proceed directly to aggregation.

### Aggregate Findings

Combine from all dimensions:
- Drift findings (grouped by severity)
- Conflicts
- Unmapped specs
- Orphaned code
- Malformed specs

### Apply Quality Gate

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| HIGH drift | N | 0 | {PASS/FAIL} |
| MEDIUM drift | N | ≤3 | {PASS/FAIL} |
| Conflicts | N | 0 | {PASS/FAIL} |
| Orphans | N | ≤3 | {PASS/FAIL} |
| Coverage | N% | ≥80% | {PASS/FAIL} |

### Determine Health Status

| Status | Criteria |
|--------|----------|
| **ALIGNED** | All gates pass |
| **DRIFT_DETECTED** | Any gate fails (not HIGH drift) |
| **MAJOR_DRIFT** | HIGH drift present OR conflicts present |

---

## Phase 4: Remediation (Optional)

**If ALIGNED**: Skip to report.

**If DRIFT_DETECTED or MAJOR_DRIFT**: Use the `question` tool:

```json
{
  "questions": [{
    "header": "Fix Issues",
    "question": "Found {count} drift issues. How to proceed?",
    "options": [
      { "label": "Fix all (Recommended)", "description": "Address all drift findings" },
      { "label": "Fix high severity only", "description": "Address MUST violations only" },
      { "label": "Report only", "description": "Review findings, fix manually" },
      { "label": "Accept current", "description": "Document as known drift" },
      { "label": "Other", "description": "Use custom text area for a different remediation plan" }
    ]
  }]
}
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

QUALITY GATE: {PASS | FAIL}
------------------------------------------------------------
| Metric          | Value | Threshold | Status |
|-----------------|-------|-----------|--------|
| HIGH drift      | N     | 0         | {P/F}  |
| MEDIUM drift    | N     | ≤3        | {P/F}  |
| Conflicts       | N     | 0         | {P/F}  |
| Orphans         | N     | ≤3        | {P/F}  |
| Coverage        | N%    | ≥80%      | {P/F}  |
------------------------------------------------------------

SPECS AUDITED: N capabilities
REQUIREMENTS: M total ({MUST}/{SHOULD}/{MAY})
SCENARIOS: K verified

{If ALIGNED}
All specifications align with implementation.

{If issues}
DETAILED FINDINGS
------------------------------------------------------------

HIGH SEVERITY (MUST violations):
{for each HIGH finding}
## DRIFT: {capability}/{requirement}
- Spec: "{spec_text}"
- Actual: {actual}
- Evidence: {file:line}
- Action: {fix suggestion}
{end}

MEDIUM SEVERITY (SHOULD violations):
{list}

CONFLICTS DETECTED:
{list with resolution hints}

ORPHANED CODE:
{list with categorization}

RECOMMENDATIONS
------------------------------------------------------------
1. {highest priority - usually HIGH drift}
2. {next priority}
3. {next priority}

{If strict mode failed}
STRICT MODE FAILURES:
- {items that pass standard but fail strict}
{end}

============================================================
```

### JSON Format (if --json)

```json
{
  "health": "ALIGNED|DRIFT_DETECTED|MAJOR_DRIFT",
  "quality_gate": {
    "status": "PASS|FAIL",
    "metrics": {...}
  },
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
Quality Gate: {PASS | FAIL}

  ⚡ Recommended next step (Plan agent):
     /adv-proposal <summary>
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
