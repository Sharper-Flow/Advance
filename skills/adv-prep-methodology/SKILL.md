---
name: adv-prep-methodology
description: "Pre-implementation gap analysis with INVEST criteria, task sequencing, and cross-cutting concern checklist"
keywords: ["prep", "planning", "gap-analysis", "invest", "task-sequencing", "cross-cutting", "requirements"]
metadata:
  priority: high
  source: docs/checklists/prep-checklist.md
---

# Prep Methodology Skill

## Purpose

Reusable gap analysis and task synthesis methodology for ADV prep workflows. Provides the INVEST criteria, requirements smell detection, task sequencing rules, and cross-cutting concern checklist.

**Canonical source:** `docs/checklists/prep-checklist.md` — see that checklist for detailed INVEST checks, sequencing rules, absorption analysis, TDD ordering, dependency coherence, and cross-cutting concern templates. Do not duplicate its content here.

## Gap Analysis Protocol

Every `/adv-prep` invocation must execute these steps:

| # | Step | Focus |
|---|------|-------|
| 1 | Requirements quality | INVEST criteria + smell detection |
| 2 | Task completeness | Atomic tasks, coverage, verification steps |
| 3 | Task sequencing | Absorption, TDD ordering, dependency coherence |
| 4 | Cross-cutting concerns | Error handling, logging, validation, security, performance, config, monitoring |
| 5 | Codebase impact | Key term search, missing files, undiscovered dependencies |
| 6 | Cross-spec consistency | Terminology, overlapping scope, conflicts |
| 7 | Cross-repo routing | Target metadata, related repos config, routing completeness |

All steps must be executed. Skipping requires explicit justification.

See `docs/checklists/prep-checklist.md` for detailed rules per step and the MoSCoW prioritization framework.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the planning gate
- **Canonical source** — defer to `docs/checklists/prep-checklist.md` for detailed rules
- **No architecture decisions** — those belong in `/adv-design`
- **No workflow sequencing** — the command owns phase ordering
