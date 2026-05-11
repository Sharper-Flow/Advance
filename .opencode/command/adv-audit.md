---
name: adv-audit
description: Detect drift between specs and current implementation
---
<!-- manifest: adv-audit · requiresChangeId: false -->
<!-- rq-ambiguityScan01 rq-ambiguityScan02 rq-ambiguityScan03 rq-ambiguityScan04 rq-ambiguityScan05 -->
# ADV Audit — Spec/Implementation Alignment Check

Multi-phase audit for spec/implementation drift. Uses sub-agents and quality gates. Command owns orchestration + metadata write.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Phase 0: Load Skill

`skill("adv-audit")` → quality gates, audit dimensions, sub-agent roles, drift severity, report schema. If unavailable, use fallback below.

Fallback: parse specs, map code, detect conflicts/drift/orphans, apply gates, report, write metadata.

## Target Resolution

Parse `$ARGUMENTS`: `capability` optional, `--json`, `--all` default, `--strict`. Capability provided → audit only that spec/capability; empty/`--all` → audit all specs.

## Pre-flight

1. `adv_spec action: "list"` → stop if no specs.
2. `adv_change_list` → warn active changes may affect accuracy.
3. Record `{workdir}` via `pwd`; include `WORKING DIRECTORY: {workdir}` in sub-agent prompts.

---

## Quality Gates

Use skill thresholds. Standard: HIGH drift 0, MEDIUM drift ≤3, orphaned code ≤3 files, conflicts 0, coverage ≥80%, CRITICAL ambiguity 0, HIGH ambiguity ≤3. `--strict`: all drift/conflict/orphan/ambiguity thresholds 0, coverage 100%.

Ambiguity gates honor `clarify_enforcement` flag (read from project config or spec context):
<!-- rq-clarifyEnforcementAudit01 -->
- `off` — skip ambiguity detection entirely
- `advisory` — include findings in report; do not affect health status
- `strict` — enforce ambiguity gates (CRITICAL and HIGH thresholds apply)

---

## Phase 1: Analysis Sub-Agents

Execute stages:

1. Spec Parser → requirements, normative language, scenarios, refs, smells.
2. Parallel after parser: Code Mapper + Conflict Detector.
3. After mapper: Drift Scanner.

Each prompt includes `WORKING DIRECTORY: {workdir}` and expected JSON: `dimension`, `findings`, `summary`.

> Ambiguity detection (B/F/S/Q/E taxonomy) runs inline during Phase 3 Synthesis using `runSpecAmbiguityChecks(markdown, capability)` — not a sub-agent stage.

---

## Phase 2: Orphan Detection

After Code Mapper, list source files not mapped to any spec (>50 lines; exclude config/types/generated/test utils). Categorize: undocumented feature, dead code, infrastructure.

---

## Phase 3: Synthesis

> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate.

Combine drift, conflicts, unmapped specs, orphans, malformed specs.

### Inline Ambiguity Detection

For each spec audited, call `runSpecAmbiguityChecks(markdown, capability)` from `plugin/src/validator/index.ts`. This pure-function scan uses the B/F/S/Q/E taxonomy:

- **B** — Boundary ambiguity (vague scope without explicit in/out)
- **F** — Functional ambiguity (vague behavioral terms, missing scenarios)
- **S** — Completion Signal ambiguity (subjective success criteria without measurement)
- **Q** — Quality Attribute ambiguity (unquantified NFR claims)
- **E** — Error Handling ambiguity (failure potential without failure scenarios)

Finding shape: `{id, category, severity (CRITICAL|HIGH|MEDIUM|LOW), spec ref, specText (verbatim), issue, fix}`.

Skip this step when `clarify_enforcement: 'off'`.

### Apply Quality Gates

| Status | Criteria |
|---|---|
| ALIGNED | all gates pass |
| DRIFT_DETECTED | gate fails without HIGH drift/conflict/ambiguity |
| MAJOR_DRIFT | HIGH drift, conflicts, or CRITICAL ambiguity present |

Ambiguity-promoted health:
- CRITICAL ambiguity ≥ 1 → **MAJOR_DRIFT**
- HIGH ambiguity > 3 (standard) or any HIGH (strict) → **DRIFT_DETECTED**
- `clarify_enforcement: 'advisory'` → include findings in report only; do not promote health

---

## Phase 4: Remediation (Optional)

If ALIGNED → report. If drift → report by default. Ask via `question` only when user explicitly wants remediation, partial-fix prioritization, or debt acceptance. If fixing → establish contract → spawn fix sub-agents.

If ambiguity findings are present and `clarify_enforcement` is `advisory` or `strict`, include an informational handoff in the report:

> Ambiguity findings can be resolved via `/adv-clarify`. Pass the structured findings list as context. Resolution writes back to the relevant spec file (not ADV change state).

---

## Final Report

Emit PROJECT AUDIT REPORT: scope, health, quality gate table, specs audited, requirement/scenario counts. If issues: findings by severity, spec text, actual, evidence, fix suggestion, conflicts, orphans, ambiguity findings, top 3 recommendations.

JSON mode:

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

---

## Phase 5: Write Metadata

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"adv-audit"`
- `count`: drift finding count + ambiguity finding count, 0 if none
- `summary`: `"{drift_count} drift + {ambiguity_count} ambiguity finding(s): {spec1, spec2, ...}"` or `"no drift or ambiguity detected"`
- `written_by`: `"agent"`

## Key Tools

| Purpose | Tool |
|---|---|
| List/show/search specs | `adv_spec` |
| List changes | `adv_change_list` |
