---
name: adv-harden-methodology
description: "6-scanner hardening framework with severity scoring, debt quadrant, and documentation hygiene"
keywords: ["harden", "quality", "testing", "security", "deployment", "production-readiness", "technical-debt"]
metadata:
  priority: high
  source: docs/checklists/harden-checklist.md
---

# Harden Methodology Skill

## Purpose

Reusable hardening methodology for ADV harden workflows. Provides the 6-scanner framework, severity scoring, technical debt quadrant, and status determination criteria.

**Canonical source:** `docs/checklists/harden-checklist.md` — this skill references that checklist; do not duplicate its content here.

## 6-Scanner Framework

Every hardening pass must run all 6 scanners:

| Scanner | Focus |
|---------|-------|
| Test Coverage | File-level coverage ratio, TDD evidence audit |
| AI-Slop Detection | Placeholders, type erosion, naive patterns, structural issues |
| Documentation Hygiene | Conflict detection, staleness audit, deletion of superseded docs |
| Cleanup | Temp files, debug code, dead imports, orphaned tests |
| Production Readiness | Security, reliability, performance, maintainability |
| Deployment Readiness | Env vars, migrations, external services, CI/CD, infrastructure |

All 6 must be executed. Skipping requires explicit justification.

## Severity Scoring

| Severity | Criteria |
|----------|----------|
| BLOCKER | Security risk, data loss, crashes |
| HIGH | Silent failures, maintainability crisis |
| MEDIUM | Technical debt accumulation |
| LOW | Style issues, minor inefficiencies |

### Priority Matrix (Impact x Effort)

```
Impact (1-5): Security=5, Production=4, Friction=3, Debt=2, Style=1
Effort (1-5): <1hr=5, <1day=4, <1week=3, <1sprint=2, >1sprint=1
Priority = Impact x Effort
  20-25: Critical | 12-19: High | 6-11: Medium | 1-5: Low
```

## Technical Debt Quadrant

Classify debt using Fowler's quadrant:

| | Prudent | Reckless |
|---|---------|----------|
| **Deliberate** | "Ship now, fix later" → Track | "No time for design" → Escalate |
| **Inadvertent** | "Now we know better" → Refactor | "What's layering?" → Train |

## Status Determination

| Status | Criteria |
|--------|----------|
| READY | No BLOCKER, no HIGH, ≤3 MEDIUM |
| NEEDS_WORK | No BLOCKER but HIGH or >3 MEDIUM |
| BLOCKED | Any BLOCKER |

## Minimum Findings Threshold

At least 3 non-nit findings per hardening pass. If fewer, require genuinely-clean justification with scanner-level evidence per the canonical checklist.

## Documentation Hygiene Standard

1. **Delete > Update** — if >80% stale or superseded, delete it
2. **No Conflicts** — docs contradicting implementation are BLOCKER
3. **No Duplication** — information lives in ONE canonical location
4. **Succinct** — scannable in <30 seconds; tables and bullets over prose
5. **Long-term Value** — document what agents need across sessions

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the harden gate
- **Canonical source** — defer to `docs/checklists/harden-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering and sub-agent orchestration
