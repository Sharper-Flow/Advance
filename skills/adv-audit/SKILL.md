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
| CRITICAL ambiguity | 0 |
| HIGH ambiguity | ≤3 |

### Strict

All drift/conflict/orphan/ambiguity thresholds → 0. Coverage → 100%.

### Ambiguity Gate Behavior

| `clarify_enforcement` | Behavior |
|---|---|
| `off` | Skip ambiguity detection |
| `advisory` | Include findings in report; do not affect health status |
| `strict` | Enforce CRITICAL=0 and HIGH thresholds |

<!-- rq-ambiguityScan01 rq-ambiguityScan02 rq-ambiguityScan03 rq-ambiguityScan04 rq-ambiguityScan05 rq-clarifyEnforcementAudit01 -->

## Analysis Dimensions

### Spec Parser

Extract from each spec:

- requirement ID and title
- normative language: `MUST`, `SHALL`, `SHOULD`, `MAY`
- Given/When/Then scenarios
- file/code references
- malformed or ambiguous requirement smells

### Ambiguity Detection

Inline pure-function scan using `runSpecAmbiguityChecks(markdown, capability)` with B/F/S/Q/E taxonomy:

| Category | Focus | Example trigger |
|---|---|---|
| **B** — Boundaries | Vague scope without explicit in/out | "handle all edge cases" |
| **F** — Functional | Vague behavioral terms, missing scenarios | "appropriate behavior" |
| **S** — Completion Signals | Subjective success criteria | "fast response" without threshold |
| **Q** — Quality Attributes | Unquantified NFR claims | "scalable" without metric |
| **E** — Error Handling | Failure potential without failure scenarios | Describes retry without timeout/fallback |

Severity: CRITICAL | HIGH | MEDIUM | LOW. Each finding includes verbatim `specText`, `issue`, and `fix`.

Skipped when `clarify_enforcement: 'off'`. Advisory mode includes findings without affecting gates. Strict mode enforces thresholds.

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
- ambiguity findings by severity (when enabled)

Health status:

| Status | Criteria |
|---|---|
| ALIGNED | all quality gates pass |
| DRIFT_DETECTED | any gate fails, but no HIGH drift/conflict/ambiguity |
| MAJOR_DRIFT | HIGH drift, conflicts, or CRITICAL ambiguity present |

Ambiguity-promoted health:
- CRITICAL ambiguity ≥ 1 → MAJOR_DRIFT
- HIGH ambiguity > 3 (standard) or any HIGH (strict) → DRIFT_DETECTED
- `clarify_enforcement: 'advisory'` → findings in report only, no health promotion

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
  "ambiguity": [
    {
      "id": "...",
      "category": "B|F|S|Q|E",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "spec": "capability/rq-id",
      "specText": "verbatim quote",
      "issue": "...",
      "fix": "..."
    }
  ],
  "recommendations": []
}
```

## Constraints

- Read-only methodology only.
- Command owns metadata write and any remediation handoff.
- Report by default; do not auto-fix.
- Ask via `question` only for explicit remediation/debt-priority choices.
- Structural spec refs beat heuristic matches.
