---
name: adv-discover-methodology
description: "Discovery rigor protocol with 8 mandatory analysis steps and structured output schema"
keywords: ["discover", "discovery", "investigation", "context-analysis", "evidence-gathering", "gap-analysis"]
metadata:
  priority: high
  source: docs/checklists/discover-checklist.md
---

# Discover Methodology Skill

## Purpose

Reusable discovery methodology for ADV discover workflows. Provides the protocol step overview and constraints.

**Canonical source:** `docs/checklists/discover-checklist.md` — see that checklist for detailed rules per step, edge case handling, and output section schema. Do not duplicate its content here.

## Discovery Protocol (8 Steps)

Every `/adv-discover` invocation must execute these 8 protocol steps and emit a Discovery Checklist section summarizing their results:

| # | Step                                               | Output section        | Required content                                                                                                                                                                                                                                                                                                                 |
| - | -------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 | **Skill Discovery** (Phase 1.5)                    | Skills Considered     | Examined skills + match results (or "none available")                                                                                                                                                                                                                                                                            |
| 2 | **Prior Research Extension**                       | Extends               | Cited artifacts (including `/adv-improve` research packs under `docs/*-prep.md`) + ≥1 new finding (or "No prior research found")                                                                                                                                                                                                 |
| 3 | **Conflict & Related-Work Scan** (Phase 1.6)       | Conflict Scan         | Results from `adv_change_list` (includeArchived), `adv_change_validate`, `adv_agenda_list`                                                                                                                                                                                                                                       |
| 4 | **Edge Case Investigation**                        | Edge Cases            | ≥2 edge cases per gap (or "N/A: structural" with rationale)                                                                                                                                                                                                                                                                      |
| 5 | **Design Question Depth**                          | Open Design Questions | Each question annotated with trust model, blast radius, alternatives                                                                                                                                                                                                                                                             |
| 6 | **Draft Spec Delta Shapes**                        | Draft Spec Deltas     | `rq-*` IDs + ≥1 G/W/T per delta (or "No spec deltas required")                                                                                                                                                                                                                                                                   |
| 7 | **P25 Related-Pattern Scan** (Phase 1.7)           | Related Pattern Scan  | Similar patterns or "no similar patterns found"                                                                                                                                                                                                                                                                                  |
| 8 | **LBP Check (with gated External-Solution Check)** | LBP Check             | Whether the likely direction matches long-term best practice. When ecosystem unknowns or external-alternative design questions exist, first cite any relevant `docs/*-prep.md` pack; only run fresh Kagi queries when no relevant pack covers the question. Purely internal changes may record "No external alternatives apply". |

After all 8 steps, emit a **Discovery Checklist** table listing each step with PASS/SKIP + reason.

See `docs/checklists/discover-checklist.md` for detailed rules per step, graceful degradation handling, and the full output section schema.

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the discovery gate
- **Canonical source** — defer to `docs/checklists/discover-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering
- **No architecture decisions** — those belong in `/adv-design`
