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

Reusable hardening methodology for ADV harden workflows. Provides the 6-scanner framework overview.

**Canonical source:** `docs/checklists/harden-checklist.md` — see that checklist for severity scoring, priority matrix, status determination, minimum findings threshold, documentation hygiene standard, and technical debt classification. Do not duplicate its content here.

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

See `docs/checklists/harden-checklist.md` for detailed per-scanner rules, severity scoring, status determination criteria, and genuinely-clean justification requirements.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the harden gate
- **Canonical source** — defer to `docs/checklists/harden-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering and sub-agent orchestration
