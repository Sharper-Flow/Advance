---
name: adv-discover-methodology
description: "Discovery rigor protocol with 9 mandatory analysis steps and structured output schema"
keywords: ["discover", "discovery", "investigation", "context-analysis", "evidence-gathering", "gap-analysis"]
metadata:
  priority: high
  source: docs/checklists/discover-checklist.md
---

# Discover Methodology Skill

## Purpose

Reusable discovery methodology for ADV discover workflows. Provides the 9-step analysis protocol, required output schema, and edge case handling rules.

**Canonical source:** `docs/checklists/discover-checklist.md` — this skill references that checklist; do not duplicate its content here.

## Discovery Protocol (8 Steps + Checklist Emission)

Every `/adv-discover` invocation must execute these 8 protocol steps, then emit a Discovery Checklist section summarizing their results:

| # | Step | Output section | Required content |
|---|------|---------------|-----------------|
| 1 | **Discovery Checklist** | Discovery Checklist | Table of all 9 steps with PASS/SKIP + reason for each |
| 2 | **Phase 1.5: Skill Discovery** | Skills Considered | Examined skills + match results (or "none available") |
| 3 | **Prior Research Extension** | Extends | Cited artifacts + ≥1 new finding (or "No prior research found") |
| 4 | **Conflict & Related-Work Scan** | Conflict Scan | Results from `adv_change_list` (includeArchived), `adv_change_validate`, `adv_agenda_list` |
| 5 | **Edge Case Investigation** | Edge Cases | ≥2 edge cases per gap (or "N/A: structural" with rationale) |
| 6 | **Design Question Depth** | Open Design Questions | Each question annotated with trust model, blast radius, alternatives considered |
| 7 | **Draft Spec Delta Shapes** | Draft Spec Deltas | `rq-*` IDs + ≥1 Given/When/Then scenario per delta (or "No spec deltas required") |
| 8 | **P25 Related-Pattern Scan** | Related Pattern Scan | Similar patterns found or "no similar patterns found" |
| 9 | **LBP Check** | LBP Check | Whether the likely direction matches long-term best practice |

## Skill Discovery Protocol (Step 2)

Phase 1.5 follows the protocol defined in `ADV_INSTRUCTIONS.md § Skill Discovery Protocol`:

1. Search trusted skill directories: `~/.config/opencode/skills/*/SKILL.md`, repo `skills/*/SKILL.md`
2. Read YAML frontmatter from each `SKILL.md`
3. Match `keywords` against the change's tech stack and domain
4. Load matching skills via `skill("{name}")`
5. Apply guidance from loaded skills

**Graceful degradation:**
- Skip skills without frontmatter or `keywords` field
- No matches → proceed normally, report "no skills matched"
- No skill directories found → report "Skills considered: none available"

## Prior Research Extension (Step 3)

Search these canonical locations for prior artifacts:

| Location | What to look for |
|----------|-----------------|
| `temp/*.md` | Brainstorm or prep documents |
| `docs/*-prep.md` | Research preparation documents |
| Archived changes | `adv_change_list includeArchived: true` → inspect relevant archives via `adv_change_show` |

**Rules:**
- Cite each found artifact in the "Extends" section
- Add ≥1 new finding not present in the cited artifact
- Do NOT count the change's own `proposal.md` as "prior research" (self-referential)
- If no prior artifacts exist, report "No prior research found" (non-blocking)

## Conflict Scan (Step 4)

Execute all three tools and report findings:

1. `adv_change_list includeArchived: true` — surface related active and archived changes
2. `adv_change_validate` on the target change — note own-change pre-prep warnings (NO_TASKS, NO_DELTAS) are expected and should NOT be reported as conflicts
3. `adv_agenda_list` — check for overlapping agenda items

## Edge Case Investigation (Step 5)

For each gap or problem area identified during discovery:

- Document ≥2 edge cases or failure modes
- Consider: null/undefined traps, type coercion, error paths, concurrency, boundary conditions
- If a gap is purely structural (no logic to test), mark "Edge cases: N/A — structural" with rationale

## Design Question Depth (Step 6)

Each open design question must include three annotations:

| Annotation | Description |
|-----------|-------------|
| **Trust model** | Who controls this? Agent-only, user-only, or joint? |
| **Blast radius** | What breaks or changes if we choose wrong? List affected scope. |
| **Alternatives** | Viable options with recommendation (or "none viable, single direction") |

## Output Schema

Discovery output persisted via `adv_change_update` must contain these sections (in any order):

- Discovery Checklist (table with PASS/SKIP + reason)
- Skills Considered (table with skill, match, action)
- Extends (cited artifacts + new findings)
- Conflict Scan (tool results + assessment)
- Current State (what exists today)
- Edge Cases (table per gap)
- Open Design Questions (table with trust + blast + alternatives)
- Draft Spec Deltas (rq-* IDs + G/W/T)
- Related Pattern Scan (matches or "none found")
- LBP Check (direction + evidence)
- Recommended Objectives (numbered list for /adv-agree)

## Constraints

- **Read-only guidance** — this skill does not mutate ADV state
- **No gate completion** — the command owns the discovery gate
- **Canonical source** — defer to `docs/checklists/discover-checklist.md` for detailed rules
- **No workflow sequencing** — the command owns phase ordering
- **No architecture decisions** — those belong in `/adv-design`
