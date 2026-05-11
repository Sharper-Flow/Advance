---
name: adv-audit
description: "Spec/implementation drift audit methodology for ADV capabilities"
keywords:
  [
    "adv",
    "audit",
    "specs",
    "drift",
    "quality-gates",
    "orphan-code",
    "conformance",
  ]
metadata:
  priority: medium
  source: adv-audit-command
---

# ADV Audit Skill

## Purpose

Methodology for `/adv-audit`: compare specs with implementation, detect drift/conflicts/orphans, and produce objective quality-gate result. Skill is read-only guidance; command owns sub-agent dispatch and metadata writes.

## Inputs

- `capability` optional
- `--all` default when no capability
- `--json` for structured output
- `--strict` for zero-tolerance gates

## Quality Gates

### Standard

| Metric | Threshold |
|---|---|
| HIGH drift (`MUST`/`SHALL` violations) | 0 |
| MEDIUM drift (`SHOULD` violations) | ≤3 |
| Orphaned code | ≤3 files |
| Spec conflicts | 0 |
| Coverage | ≥80% |

### Strict

All drift/conflict/orphan thresholds → 0. Coverage → 100%.

## Analysis Dimensions

### Spec Parser

Extract from each spec:

- requirement ID and title
- normative language: `MUST`, `SHALL`, `SHOULD`, `MAY`
- Given/When/Then scenarios
- file/code references
- malformed or ambiguous requirement smells

### Code Mapper

Verify file refs exist, build bidirectional spec↔code map, and calculate coverage:

```text
coverage = mapped_requirements / total_requirements
```

Identify unmapped specs and implementation files with no spec anchor.

### Conflict Detector

Cross-reference specs for:

- contradictory requirements
- overlapping ownership
- stale refs
- terminology mismatch
- mutually exclusive scenarios

### Drift Scanner

Compare requirements to code/tests. Detect:

- constraint drift
- missing implementation
- test/spec mismatch
- normative violations

Severity:

| Severity | Meaning |
|---|---|
| HIGH | `MUST`/`SHALL` violation |
| MEDIUM | `SHOULD` violation |
| LOW | `MAY` or low-risk inconsistency |
| REVIEW | needs human judgment |

## Orphan Detection

Source file is orphan candidate when >50 lines and not mapped to any spec.

Exclude:

- config
- types-only files
- generated files
- test utilities
- fixtures

Categorize as undocumented feature, dead code, or infrastructure.

## Sub-Agent Packet

Every analysis worker receives:

```text
WORKING DIRECTORY: {workdir}
AUDIT TARGET: {capability | all}
STRICT MODE: {true|false}
EXPECTED OUTPUT: JSON with dimension, findings[], summary
```

Finding shape:

```json
{
  "id": "...",
  "severity": "HIGH|MEDIUM|LOW|REVIEW",
  "spec": "capability/rq-id",
  "specText": "...",
  "actual": "...",
  "evidence": "file:line or spec ref",
  "fix": "..."
}
```

## Synthesis

Aggregate:

- drift by severity
- conflicts
- unmapped specs
- orphan files
- malformed specs
- coverage

Health status:

| Status | Criteria |
|---|---|
| ALIGNED | all quality gates pass |
| DRIFT_DETECTED | any gate fails, but no HIGH drift/conflict |
| MAJOR_DRIFT | HIGH drift or conflicts present |

## Report Schema

Text report:

- PROJECT AUDIT REPORT banner
- scope and health status
- quality gate table: metric/value/threshold/status
- specs audited, requirements count, scenarios count
- detailed findings by severity
- conflicts with resolution hints
- orphaned code categories
- top 3 recommendations

JSON report:

```json
{
  "health": "ALIGNED|DRIFT_DETECTED|MAJOR_DRIFT",
  "quality_gate": [],
  "summary": {},
  "drift": [],
  "conflicts": [],
  "orphans": [],
  "recommendations": []
}
```

## Constraints

- Read-only methodology only.
- Command owns metadata write and any remediation handoff.
- Report by default; do not auto-fix.
- Ask via `question` only for explicit remediation/debt-priority choices.
- Structural spec refs beat heuristic matches.
