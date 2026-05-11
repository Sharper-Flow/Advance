# ADR-0002: Skill sync copies whole directory, not SKILL.md only

**Status:** accepted
**Date:** 2026-05-11
**Change:** adoptMattpocockSkills

## Decision

`scripts/sync-global.sh` syncs entire skill directories (`cp -R`) to `~/.config/opencode/skills/{name}/`, preserving SKILL.md plus all sibling reference docs and subdirectories. Previously it copied SKILL.md only.

## Context

The change introduces:
1. Vendored Pocock skills with multi-file structure: `adv-diagnose/` has `scripts/hitl-loop.template.sh`; `adv-prototype/` has `LOGIC.md` + `UI.md`.
2. Progressive-disclosure content-splits of 5 large existing skills: SKILL.md becomes index + core; deep-dive content moves to sibling `*.md` (WSJF.md, BOOTSTRAP.md, CATEGORIES.md, etc.).

Both require the sync to ship the whole skill directory, not just SKILL.md. Without this change, content-split SKILL.md files would reach global skills dir as truncated indexes referencing siblings that don't exist there — agents loading the skill globally would see only the indexes.

## ADR rubric

| Criterion | Result |
|---|---|
| Hard to reverse | Medium — consumers (agents loading skills via `skill("name")`) will expect siblings to exist at the global path; reverting would break them. |
| Surprising without context | Yes — the sync historically copied SKILL.md only; the change of file-layout expectation is non-obvious without this record. |
| Result of real tradeoff | Yes — alternative was to keep all content inline in SKILL.md (rejected: breaks the 638-line adv-triage refactor and damages progressive disclosure). |

All 3 criteria met → ADR warranted.

## Considered Options

| Option | Outcome |
|---|---|
| **Whole-directory copy (chosen)** | Sibling docs and subdirectories ship to global. Backward-compatible: skills with only SKILL.md (all 15 existing skills) sync identically. |
| Keep SKILL.md-only sync, inline all content | Damages progressive disclosure. Forces adv-triage 638 lines into one file. Pocock's bundled supporting files (LOGIC.md, UI.md, scripts/) can't ship. Rejected. |
| Add a manifest file listing additional files per skill | Adds authoring overhead. Brittle: drift between manifest and disk. Rejected as YAGNI. |

## Consequences

**Positive:**
- Progressive-disclosure skill authoring becomes viable (sibling reference docs reach agents)
- Pocock-style multi-file skills work as authored without modification
- Skill structure (subdirs like `scripts/`) is preserved
- File-count tracking in sync output gives operator visibility (`copied skill: name/ (N files)`)

**Negative / Known limitations:**
- **Stale sibling cleanup:** If a skill modifies its sibling set (e.g., removes `REFERENCE.md`), stale files in global persist until manual cleanup or whole-skill removal. The existing stale-skill removal logic (lines 1343-1355) removes whole directories not in repo, not partial-file drift inside a kept directory. Acceptable for now: skills don't churn frequently, and stale files don't actively break anything. Address if it becomes a problem.
- **Slightly increased disk usage in global skills dir** for skills with extensive sibling content. Negligible (kilobytes per skill).

## Verification

- Dry-run diff before/after change against current `skills/` (15 single-file skills): zero output difference. Backward-compatible.
- Multi-file fixture test: SKILL.md + REFERENCE.md + scripts/helper.sh all copied with directory structure preserved.

## References

- `scripts/sync-global.sh` lines 1318-1345 (post-change)
- Decision context: `agreement.md` Objective 1; `design.md` Decision 2
- Spec compliance: `rq-proseReduction03` (inventory update), `rq-skillProseCompression01` (already at compression target — this change is orthogonal content-split)
