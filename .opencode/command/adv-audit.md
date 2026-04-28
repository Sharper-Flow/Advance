---
name: adv-audit
description: Detect drift between specs and current implementation
---
<!-- manifest: adv-audit · requiresChangeId: false -->
# ADV Audit — Spec/Implementation Alignment Check
Multi-phase audit via sub-agents to detect drift between specs and implementation. SonarQube-style quality gates for objective pass/fail.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
<UserRequest>
  $ARGUMENTS
</UserRequest>
## Target Resolution
Parse `$ARGUMENTS`: `capability` (optional), `--json`, `--all` (default), `--strict`.
1. If capability provided → audit that only
2. If empty/--all → audit all specs
## Pre-flight
1. `adv_spec action: "list"` → stop if no specs
2. `adv_change_list` → warn if active changes may affect accuracy
3. Worktree context: `pwd` → record `{workdir}`, include in all sub-agent prompts

---
## Quality Gates
### Standard
| Metric | Threshold |
|--------|-----------|
| HIGH drift (MUST/SHALL violations) | 0 |
| MEDIUM drift (SHOULD violations) | ≤3 |
| Orphaned code | ≤3 files |
| Spec conflicts | 0 |
| Coverage | ≥80% |
### Strict (--strict)
All thresholds → 0, coverage → 100%.

---
## Phase 1: Analysis Sub-Agents
Execute in stages (dependencies):

**Stage 1:** Spec Parser → extract requirements (ID, title, normative language, scenarios, file refs, smells)

**Stage 2 (parallel, after Stage 1):**
- Code Mapper → verify file refs exist, build bidirectional spec↔code map, calculate coverage
- Conflict Detector → cross-reference for contradictions, overlapping scope, stale refs, terminology inconsistencies

**Stage 3 (after Code Mapper):** Drift Scanner → constraint drift, missing implementation, test-spec mismatch, normative violations. Severity: HIGH (MUST/SHALL), MEDIUM (SHOULD), LOW (MAY), REVIEW (needs judgment).

Each sub-agent receives `WORKING DIRECTORY: {workdir}` and returns structured JSON with `dimension`, findings, and summary.

---
## Phase 2: Orphan Detection
After Code Mapper: list source files not mapped to any spec (>50 lines, excluding config/types/generated/test utils). Categorize: undocumented feature, dead code, infrastructure.

---
## Phase 3: Synthesis
> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate.

Combine: drift findings (by severity), conflicts, unmapped specs, orphans, malformed specs. Apply quality gate → determine health:
| Status | Criteria |
|--------|----------|
| ALIGNED | All gates pass |
| DRIFT_DETECTED | Any gate fails (not HIGH) |
| MAJOR_DRIFT | HIGH drift or conflicts present |

---
## Phase 4: Remediation (Optional)
If ALIGNED → skip to report.

If drift → default to reporting findings. Ask via `question` only when the user explicitly wants remediation, partial-fix prioritization, or debt acceptance guidance.

If fixing → establish contract → spawn fix sub-agents.

---
## Final Report
Emit PROJECT AUDIT REPORT: scope, health status, quality gate table (metric/value/threshold/status), specs audited, requirements/scenarios counts.

If issues: detailed findings by severity (spec text, actual, evidence, fix suggestion), conflicts with resolution hints, orphaned code with categorization, top 3 recommendations.

JSON format if `--json`: health, quality_gate, summary, drift, conflicts, orphans, recommendations.

---
## Phase 5: Write Metadata
After successful completion, call `adv_project_metadata action:"write"` with:
- `key`: `"adv-audit"`
- `count`: drift finding count (0 if no drift)
- `summary`: one-line string:
  - If count > 0: `"{count} drift finding(s): {spec1, spec2, ...}"`
  - If count = 0: `"no drift detected"`
- `written_by`: `"agent"`

This persists the audit result for display in `/adv-status`.

---


---
## Key Tools
| Purpose | Tool |
|---------|------|
| List/show/search specs | `adv_spec` |
| List changes | `adv_change_list` |
