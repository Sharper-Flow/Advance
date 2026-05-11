# ADV Audit Report Schema

## Sub-Agent Packet

Every analysis worker receives:

```text
WORKING DIRECTORY: {workdir}
AUDIT TARGET: {capability | all}
STRICT MODE: {true|false}
EXPECTED OUTPUT: JSON with dimension, findings[], summary
```

## Finding Shape

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

## Text Report

Text report includes:

- `PROJECT AUDIT REPORT` banner.
- Scope and health status.
- Quality gate table: metric / value / threshold / status.
- Specs audited, requirement count, scenario count.
- Detailed findings by severity.
- Conflicts with resolution hints.
- Orphaned code categories.
- Top 3 recommendations.

## JSON Report

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

## Synthesis Fields

- `drift` grouped by severity.
- `conflicts` with competing spec refs.
- `unmapped_specs` or equivalent summary count.
- `orphans` grouped as undocumented feature, dead code, or infrastructure.
- `malformed_specs` with parser findings.
- `coverage` as mapped requirements / total requirements.

## Quality Gate Result

Use deterministic thresholds from `SKILL.md`. In strict mode, all drift/conflict/orphan thresholds are zero and coverage must be 100%.
