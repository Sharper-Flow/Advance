---
name: adv-harden
description: Detect low-quality code, verify test coverage, clean up before release
---

# ADV Harden — Release-Stage Quality Analysis

Run release-stage hardening and block archive when actionable review findings or hardening issues remain unresolved.

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
> **CHECKLIST**: Follow [docs/checklists/harden-checklist.md](../../docs/checklists/harden-checklist.md).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Parse Flags

Extract from `$ARGUMENTS`: `change-id`, `--no-cleanup`, `--execute`, `--interactive`, `--force`.

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select the only plausible change; ask via `question` only if multiple plausible targets remain

---

## Phase 0: Load Skill

`skill("adv-harden-methodology")` → provides the 6-scanner framework, severity scoring, and debt handling rules. If unavailable, use the harden checklist as the canonical fallback.

---

## Phase 1: Pre-flight

1. `adv_change_show` + `adv_task_list` + `adv_gate_status`
2. Stop if acceptance gate is incomplete
3. Block on unapproved cancellations, incomplete cross-repo tasks, or unresolved actionable `REVIEW_FINDINGS`
4. When in a worktree, run merge compatibility check before scanners
5. Record `{workdir}` via `pwd` and include `WORKING DIRECTORY: {workdir}` in every worker prompt

---

## Phase 2: Analysis

Run all **6 hardening scanners** from the skill/checklist:

1. test coverage
2. AI-slop detection
3. documentation hygiene
4. cleanup
5. production readiness
6. deployment readiness

If a worker fails → retry once → then use inline fallback analysis. Enforce the checklist's severity scoring, status rules, and minimum-findings requirement.

Status:
- `READY` → no blocker/high findings and acceptable medium count
- `NEEDS_WORK` → actionable but non-blocking findings remain
- `BLOCKED` → blocker or unresolved review debt remains

---

## Phase 3: Remediation and Cleanup

If `READY` → proceed to report.

Otherwise default to fixing actionable in-scope findings. Ask via `question` only when choosing between partial remediation, report-only mode, or accepting debt requires user approval.

Cleanup behavior:
- no flags → preview only
- `--execute` → delete all candidates
- `--interactive` → select via `question`
- `--force` → delete without prompts

---

## Final Report

Emit HARDENING REPORT with per-scanner results, fixes applied, remaining debt, and archive readiness.

Do **not** complete a gate here. `/adv-archive` owns the release gate.

```text
/adv-harden {change-id} COMPLETE
Result: {READY | N fixed | Report only}
Next: /adv-archive {change-id}
```
