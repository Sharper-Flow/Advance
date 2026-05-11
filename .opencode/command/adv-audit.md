---
name: adv-audit
description: Detect drift between specs and current implementation
---
<!-- manifest: adv-audit · requiresChangeId: false -->
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

Use skill thresholds. Standard: HIGH drift 0, MEDIUM drift ≤3, orphaned code ≤3 files, conflicts 0, coverage ≥80%. `--strict`: all drift/conflict/orphan thresholds 0, coverage 100%.

---

## Phase 1: Analysis Sub-Agents

Execute stages:

1. Spec Parser → requirements, normative language, scenarios, refs, smells.
2. Parallel after parser: Code Mapper + Conflict Detector.
3. After mapper: Drift Scanner.

Each prompt includes `WORKING DIRECTORY: {workdir}` and expected JSON: `dimension`, `findings`, `summary`.

---

## Phase 2: Orphan Detection

After Code Mapper, list source files not mapped to any spec (>50 lines; exclude config/types/generated/test utils). Categorize: undocumented feature, dead code, infrastructure.

---

## Phase 3: Synthesis

> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate.

Combine drift, conflicts, unmapped specs, orphans, malformed specs. Apply gates:

| Status | Criteria |
|---|---|
| ALIGNED | all gates pass |
| DRIFT_DETECTED | gate fails without HIGH drift/conflict |
| MAJOR_DRIFT | HIGH drift or conflicts present |

---

## Phase 4: Remediation (Optional)

If ALIGNED → report. If drift → report by default. Ask via `question` only when user explicitly wants remediation, partial-fix prioritization, or debt acceptance. If fixing → establish contract → spawn fix sub-agents.

---

## Final Report

Emit PROJECT AUDIT REPORT: scope, health, quality gate table, specs audited, requirement/scenario counts. If issues: findings by severity, spec text, actual, evidence, fix suggestion, conflicts, orphans, top 3 recommendations. JSON mode: health, quality_gate, summary, drift, conflicts, orphans, recommendations.

---

## Phase 5: Write Metadata

After successful completion, call `adv_project_metadata action:"write"`:

- `key`: `"adv-audit"`
- `count`: drift finding count, 0 if none
- `summary`: `"{count} drift finding(s): {spec1, spec2, ...}"` or `"no drift detected"`
- `written_by`: `"agent"`

## Key Tools

| Purpose | Tool |
|---|---|
| List/show/search specs | `adv_spec` |
| List changes | `adv_change_list` |
