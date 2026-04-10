---
name: adv-review
description: Review deliverables for correctness, security, and architecture quality
---

# ADV Review — Acceptance-Stage Deliverable Review

Orchestrate multi-dimensional review of delivered work. This command emits `REVIEW_FINDINGS` and prepares `/adv-accept`.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
> **CHECKLIST**: Follow [docs/checklists/review-checklist.md](../../docs/checklists/review-checklist.md).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution
1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---

## Phase 0: Load Skill
`skill("adv-review-methodology")` → provides the 12-dimension review framework, comment labels, and verdict criteria. If unavailable, use the review checklist as the canonical fallback.

---

## Phase 1: Pre-flight
1. `adv_change_show` + `adv_task_list` + `adv_gate_status`
2. Stop if execution gate is incomplete or implementation evidence is missing
3. Block on unapproved cancellations or incomplete cross-repo tasks
4. Record `{workdir}` via `pwd` and include `WORKING DIRECTORY: {workdir}` in every worker prompt
5. Extract affected files, spec scenarios, and task evidence

---

## Phase 2: Analysis

Spawn **5 parallel `explore` workers** using the methodology skill + checklist dimensions:

1. requirement traceability
2. logic and edge cases
3. security
4. architecture and quality
5. cross-repo verification

If a worker fails or returns unusable output → retry once → then do inline fallback analysis for that dimension. Never skip a dimension.

---

## Phase 3: Synthesis

Aggregate findings, deduplicate, cross-reference spec scenarios, and enforce the checklist's minimum-findings rule or genuinely-clean justification.

Verdict:
- `BLOCKED` → any `blocker:`
- `CHANGES_REQUESTED` → any `issue:` and no blockers
- `APPROVED` → only suggestion/nit/none

---

## Phase 4: Remediation

If `APPROVED` → skip to report.

If findings remain → fix blockers/issues, validate suggestions/questions against specs/tests/code, re-run verification for touched areas, then recompute verdict.

Research first for non-trivial fixes. Do not block on style-only preferences or equivalent alternatives.

---

## Phase 5: Report

Emit CODE REVIEW summary plus:

```text
REVIEW_FINDINGS:
change: {change-id}
verdict: {verdict}
reviewed_at: {ISO timestamp}
findings:
  - id: {dimension}-{n}
    label: {label}
    file: {file}
    line: {N}
    what: {what}
    status: {unresolved|fixed|accepted_debt}
    fix_notes: {details}
END_REVIEW_FINDINGS
```

Do **not** complete a gate here. `/adv-accept` owns the acceptance gate.

```text
/adv-review {change-id} COMPLETE
Result: {verdict} ({fix_count} fixes applied)
Acceptance Gate: pending
Next: /adv-accept {change-id}
```
