# ADR-0001: `adv-` prefix for vendored Pocock skills

**Status:** accepted
**Date:** 2026-05-11
**Change:** adoptMattpocockSkills

## Decision

All skills vendored from `mattpocock/skills` are renamed with the `adv-` prefix when placed under `skills/`:

| Source name | Vendored name |
|---|---|
| `diagnose` | `adv-diagnose` |
| `zoom-out` | `adv-zoom-out` |
| `prototype` | `adv-prototype` |
| `write-a-skill` | `adv-skill-author` (also domain-renamed) |

## Context

The change adopts 4 Pocock skills (and 2 reference docs). `scripts/sync-global.sh` has a hard-coded glob `for skill_dir in "$REPO_SKILLS"/adv-*/` (line 1323) that selects skills for sync to `~/.config/opencode/skills/`. Non-prefixed skills are silently skipped.

Additionally, `rq-sc02` reserves the `adv-` prefix for sync-managed (repo-bundled) skills and the `agent-` prefix for auto-created skills (per ADV Skill Creation Protocol). Vendored skills are sync-managed — they ship via the bundled-skills pipeline, not via runtime agent creation.

## ADR rubric

| Criterion | Result |
|---|---|
| Hard to reverse | Yes — downstream consumers will reference `skill("adv-diagnose")` etc.; renaming costs propagation across instructions, commands, agents, and external user automations. |
| Surprising without context | Yes — a future reader looking at `skills/adv-diagnose/SKILL.md` with Pocock's authorship would wonder "is this our skill or upstream?". The rename + attribution header explains both. |
| Result of real trade-off | Yes — alternative was to broaden the sync glob to include non-prefixed names (rejected: bigger blast radius; loses the `adv-` vs `agent-` distinction; opens door to namespace collisions with future user-authored skills). |

All 3 criteria met → ADR warranted.

## Considered Options

| Option | Outcome |
|---|---|
| **`adv-` prefix rename (chosen)** | One-time per-skill rename. Matches existing 15 adv-* skills. Preserves sync-glob narrowness. Preserves `adv-` vs `agent-` distinction (`rq-sc02`). Attribution + license documented in LICENSE-THIRD-PARTY.md. |
| Broaden sync glob to non-adv-prefixed | Rejected: enlarges blast radius (every contributor's non-prefixed skill enters global namespace). Breaks the `adv-` vs `agent-` distinction. Adds maintenance burden to sync script. |
| Keep Pocock names, override sync glob with allowlist | Rejected: brittle; allowlist drifts from disk; adds bespoke logic. |
| Fork-vendor under a separate top-level dir (e.g. `vendored-skills/`) | Rejected: requires duplicating sync pipeline; loses uniform skill loading at agent startup. |

## Naming details

- `write-a-skill` → `adv-skill-author` is a **domain rename** (not just prefix). The Pocock skill is an authoring template; in ADV context it composes with the `agent-{domain}` Skill Creation Protocol, so the more precise name aids skill-discovery.
- All other renames are pure prefix-adds.

## Consequences

**Positive:**
- Uniform skill naming convention (`adv-*` for bundled, `agent-*` for auto-created)
- Sync pipeline unchanged
- Attribution preserved via per-skill header + repo-root LICENSE-THIRD-PARTY.md
- Future Pocock vendoring follows the established pattern

**Negative:**
- Skills are findable in the repo under different names than upstream. Mitigated by attribution headers (each SKILL.md cites its source path) and LICENSE-THIRD-PARTY.md (per-file mapping table).

## References

- LICENSE-THIRD-PARTY.md (attribution + source mapping table)
- `scripts/sync-global.sh:1323` (sync glob)
- `rq-sc02` (sync-managed vs auto-created skill prefix convention)
- ADR-002 (complementary decision on whole-directory sync)
