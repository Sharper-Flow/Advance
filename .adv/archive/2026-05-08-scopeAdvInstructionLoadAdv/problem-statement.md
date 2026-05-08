## Problem

`ADV_INSTRUCTIONS.md` (~68 KB / ~17,000 tokens) is required to be present in every consumer's global `opencode.json instructions[]` array — `SETUP.md` mandates it, and `scripts/sync-global.sh` currently validates and auto-adds it. Consequence: the ADV operating protocol is loaded into the system prompt of **every session in the project**, including sessions that never invoke ADV agents or tools.

Affected non-ADV agents: `build`, `plan`, `general`, `librarian`, `explore`, `mechanic`, `prioritizer`, and any future user-defined agents. None of these need the full 7-gate workflow protocol, status markers, gate machine prose, or skill-creation rules to function.

## Why this matters

1. **Token cost per turn:** Every non-ADV interaction in this project pays ~17k tokens of irrelevant context before the user's first message.
2. **Cognitive coupling:** The current model couples "uses the ADV plugin" with "loads the ADV operating manual" with "every agent must obey ADV behaviors".
3. **Documentation drift risk:** `SETUP.md` instructs users to add `ADV_INSTRUCTIONS.md` globally; users cannot opt non-ADV agents out without violating setup docs.
4. **Audit blocker:** A 2026-05-06 OpenCode setup audit identified this as the single largest token-bloat item.

## Evidence

- `SETUP.md:323-331` says `--fix` adds `ADV_INSTRUCTIONS.md` to `.instructions`.
- `SETUP.md:357-366` manual setup includes `"/path/to/Advance/ADV_INSTRUCTIONS.md"` in `instructions[]`.
- `scripts/sync-global.sh:807-814` checks that global instructions contain the canonical path.
- `scripts/sync-global.sh:932-939` auto-adds the instruction path in `--fix` mode.
- `scripts/sync-global.sh:379-411` concatenates ADV provider prompts as canonical `adv.md` body + provider hint; no ADV instruction body is included today.
- `ADV_INSTRUCTIONS.md` is 924 lines / 66,738 bytes in the current checkout.

## Out of Scope

- Restructuring `ADV_INSTRUCTIONS.md` content
- Changing the 7-gate model, ADV tool surface, or agent architecture
- Reorganizing skills, commands, or rules.yaml
- Multi-project or multi-session coordination changes