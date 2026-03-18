---
name: adv-review
description: Review code for correctness, security, and architecture; emit REVIEW_FINDINGS
agent: general
---

# ADV Review — Post-Implementation Code Review

Orchestrate multi-dimensional code review via sub-agents. Emits `REVIEW_FINDINGS` block consumed by `/adv-harden`. Uses 12-dimension framework and conventional comment labeling.

## Exits

| Exit | Condition |
|------|-----------|
| ✅ APPROVED | No blockers/issues; review gate complete |
| 🔁 CHANGES_REQUESTED | Issues found → agent fixes → re-verifies |
| 🎤 BLOCKED | Blockers found → user decides |

> **SUB-AGENT CONTEXT**: Return findings as JSON. Skip status markers.
> **CHECKLIST**: Follow [docs/checklists/review-checklist.md](../../docs/checklists/review-checklist.md).

<UserRequest>
  $ARGUMENTS
</UserRequest>

## Target Resolution

1. If change-id provided → use directly
2. If empty → `adv_change_list` → auto-select or `question` tool

---

## Phase 1: Pre-flight

### Load Context

`adv_change_show` + `adv_task_list` for target. Verify tasks are done — if no implementation, stop: "Run `/adv-apply` first."

### Gate Check

`adv_gate_status` → if implementation gate NOT complete → emit REVIEW BLOCKED banner → stop.

### Cancellation & Cross-Repo Audit

**Step 1:** Check cancelled tasks for `cancellation.approved_by_user === true`. If any lack approval → REVIEW BLOCKED → stop.

**Step 2:** Check cross-repo tasks (`target_repo`/`target_path`) are `done`. If incomplete → REVIEW BLOCKED → stop.

### Extract Context

From change data: affected files, spec scenarios, task completion evidence.

### Worktree Context

`pwd` → record as `{workdir}`. Include `WORKING DIRECTORY: {workdir}` in every sub-agent prompt. Critical in worktrees — sub-agents inherit default project root, not worktree path.

---

## 12-Dimension Review Framework

| # | Dimension | Focus |
|---|-----------|-------|
| 1 | Design | Architecture, system integration, timing |
| 2 | Functionality | Does it work? Edge cases? Concurrency? |
| 3 | Complexity | Understandable quickly? Over-engineered? |
| 4 | Tests | Coverage, tests fail when code breaks |
| 5 | Naming | Clear, communicative, appropriate length |
| 6 | Comments | Explain "why" not "what" |
| 7 | Style | Style guide conformance |
| 8 | Documentation | READMEs, API docs updated |
| 9 | Security | Auth, validation, secrets |
| 10 | Performance | Degradation risks, optimization |
| 11 | Error Handling | Correct, user-friendly, debuggable |
| 12 | Consistency | Matches existing patterns |

---

## Conventional Comment Labels

| Label | Meaning | Blocking? |
|-------|---------|-----------|
| `blocker:` | Must fix before merge | YES |
| `issue:` | Should fix, real problem | YES |
| `suggestion:` | Would improve code | NO |
| `nit:` | Minor style/preference | NO |
| `question:` | Need clarification | MAYBE |
| `praise:` | Good work worth noting | NO |

Format: `{label}: [{file}:{line}] {what}` + `Why: {why}` + `Fix: {how}` (optional).

---

## Sub-Agent Resilience

Empty/failed result = transient failure (empty string, missing `"dimension"` key, error-only).

Protocol: retry once → if still fails → inline analysis for that dimension → never skip.

| Dimension | Inline Fallback |
|-----------|----------------|
| Requirement Traceability | Search files for scenario keywords |
| Logic & Edge Cases | Read functions, check null/off-by-one/unreachable |
| Security | Scan for hardcoded secrets, unvalidated input, injection |
| Architecture & Quality | Check function length >50, duplicated blocks, naming |
| Cross-Repo | Check target_repo tasks status === "done" |

---

## Phase 2: Spawn Analysis Sub-Agents

Spawn **5 parallel sub-agents** (`subagent_type: "explore"`). Each receives: `WORKING DIRECTORY: {workdir}`, affected files, change-id.

### Sub-Agent 1: Requirement Traceability

For each scenario → search files for implementation evidence → calculate coverage → flag untraced. Return: `dimension`, `coverage_percent`, `traced`, `untraced`, `issues`.

### Sub-Agent 2: Logic & Edge Cases

Check: off-by-one, null/undefined handling, boolean logic, unreachable code, edge cases (empty/zero/max), concurrency. Return: `dimension`, `issues` (label, category, file, line, what, why, fix), `edge_cases_checked`.

### Sub-Agent 3: Security

OWASP-based: A01 Broken Access Control, A02 Crypto Failures, A03 Injection, A04 Insecure Design, A05 Misconfiguration, A06 Vulnerable Components, A07 Auth Failures, A08 Data Integrity, A09 Logging Failures, A10 SSRF. Return: `dimension`, `issues`, `auth_assessment`, `secrets_scan`.

### Sub-Agent 4: Architecture & Quality

Check: pattern conformance, module boundaries, naming, complexity (>50 lines, cyclomatic >10), DRY violations, SOLID. Return: `dimension`, `issues`, `complexity_hotspots`, `praise_worthy`.

### Sub-Agent 5: Cross-Repo Verification

Verify: all target_repo/target_path tasks done, cancelled tasks have approval. Return: `dimension`, `status`, `missing_tasks`, `unapproved_cancellations`.

---

## Phase 3: Synthesis

> Anti-Loop: after sub-agents → `>>> SYNTHESIS COMPLETE <<<` → aggregate immediately.

1. Combine all issues → group by label (blocker > issue > suggestion > nit) → deduplicate
2. Cross-reference with spec scenarios

### Minimum Findings Enforcement

If <3 non-nit findings → require genuinely-clean justification with file-level evidence per [review-checklist.md](../../docs/checklists/review-checklist.md).

### Verdict

| Verdict | Criteria |
|---------|----------|
| BLOCKED | Any `blocker:` |
| CHANGES_REQUESTED | Any `issue:` (no blockers) |
| APPROVED | Only suggestion/nit/none |

Approve when change "definitely improves overall code health." Block only on: security vulns, correctness bugs, system health degradation, missing tests for risky changes. × Don't block on style preferences, minor optimizations, equivalent alternatives.

---

## Phase 4: Display Summary

Emit CODE REVIEW banner: per-dimension status, severity breakdown, verdict.

---

## Phase 5: Remediation (if issues found)

If APPROVED → skip to completion.

If CHANGES_REQUESTED/BLOCKED → auto-remediation is mandatory:

1. **Fix all blockers/issues** — no partial fix mode. For non-trivial fixes: research first (Context7/librarian/adv-researcher) → then implement.
2. **Investigate suggestions/questions** — validate against specs/tests/code → implement if validated, reject with evidence if not.
3. **Cleanup pass** — remove temp artifacts, debug code, dead imports, stale comments.
4. **Verification** — re-run tests for touched areas, update finding status (fixed/unresolved/accepted_debt).
5. **Recompute verdict** — APPROVED only when no unresolved blocker/issue remains.

### Fix Validation Protocol

| Fix Type | Research Required? |
|----------|-------------------|
| Typos, naming, comments, dead code removal, lint fixes | No (trivial) |
| Control flow, error handling, security code, module boundaries, 3+ files, multiple viable approaches | Yes — spawn librarian/adv-researcher first |

If research reveals finding was incorrect → downgrade to `nit:` or reject with evidence.

---

## Phase 6: Final Report

### Mark Gate

If APPROVED → `adv_gate_complete changeId: {change-id} gateId: review`

### Report

Emit final CODE REVIEW banner: verdict, per-dimension summaries, numbered review comments (label, file:line, what, why, fix), positive notes, fixes applied with verification status.

### Emit REVIEW_FINDINGS Block

Always emit regardless of verdict:

```
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

Status rules: `unresolved` at emission time, `/adv-harden` checks task notes for fix evidence, `nit:` excluded from harden blocking.

Store in gate completion: `adv_gate_complete ... completedBy: "agent — {verdict}; {count} findings; REVIEW_FINDINGS emitted"`

```
/adv-review {change-id} COMPLETE
Result: {verdict} ({fix_count} fixes applied)
Review Gate: {MARKED COMPLETE | pending}
Next: /adv-harden {change-id}
```

---

## Anti-Patterns

| × Anti-Pattern | ✓ Fix |
|----------------|-------|
| Perfection-seeking | Seek "better" not "perfect" |
| Style-only blocking | Only block on style guide rules |
| Missing "why" | Explain reasoning |
| Unresearched fixes | Research non-trivial fixes first |

---

## Key Tools

| Purpose | Tool |
|---------|------|
| Load change | `adv_change_show` |
| List tasks | `adv_task_list` |
| Spawn analysis | Task tool (explore) |
| Spawn research | Task tool (librarian / adv-researcher) |
| Spawn fixes | Task tool (general) |
