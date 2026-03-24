---
name: adv-review-methodology
description: "12-dimension code review framework with conventional comment labels and verdict criteria"
keywords: ["review", "code-review", "quality", "security", "architecture", "testing"]
metadata:
  priority: high
  source: docs/checklists/review-checklist.md
---

# Review Methodology Skill

## Purpose

Reusable code review methodology for ADV review workflows. Provides the 12-dimension framework, conventional comment labels, minimum findings threshold, and verdict criteria.

**Canonical source:** `docs/checklists/review-checklist.md` — this skill references that checklist; do not duplicate its content here.

## 12-Dimension Framework

Every review must assess each dimension:

| # | Dimension | Focus |
|---|-----------|-------|
| 1 | Design | Architecture, system integration, timing |
| 2 | Functionality | Correctness, edge cases, concurrency |
| 3 | Complexity | Understandable quickly? Over-engineered? |
| 4 | Tests | Coverage adequate? Tests fail when code breaks? |
| 5 | Naming | Clear, communicative, appropriate length |
| 6 | Comments | Explain "why" not "what" |
| 7 | Style | Style guide conformance |
| 8 | Documentation | READMEs, API docs updated |
| 9 | Security | Auth, validation, secrets, OWASP top 10 |
| 10 | Performance | Degradation risks, optimization |
| 11 | Error Handling | Correct, user-friendly, debuggable |
| 12 | Consistency | Matches existing patterns |

All 12 must be checked. Skipping requires explicit justification.

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

## Minimum Findings Threshold

At least 3 non-nit findings per review. If fewer, require genuinely-clean justification with file-level evidence per the canonical checklist.

## Verdict Criteria

| Verdict | Criteria |
|---------|----------|
| BLOCKED | Any `blocker:` |
| CHANGES_REQUESTED | Any `issue:` (no blockers) |
| APPROVED | Only suggestion/nit/none |

Approve when change "definitely improves overall code health." Block only on: security vulns, correctness bugs, system health degradation, missing tests for risky changes.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the review gate
- **Canonical source** — defer to `docs/checklists/review-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering and sub-agent orchestration
