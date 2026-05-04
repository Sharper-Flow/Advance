## Problem

A 31-finding audit of `ADV_INSTRUCTIONS.md`, `AGENTS.md`, and `.opencode/instructions/cost-governance.md` surfaced drift vs current code, direct internal contradictions, and redundancy/marker ambiguity in the live ADV agent instruction surface.

Key examples:

- Retired gate names (`research`, `prep`, `implementation`) conflict with current seven-gate model (`discovery`, `planning`, `execution`).
- `adv_status` / `adv_temporal_diagnose` are documented as lacking `target_path` even though code supports it.
- Worktree tooling failure says both "hard block" and "proceed in-place".
- `[ADV:SKILL_CREATED]` is classified as both agent-emitted and system-emitted.
- `_contextSnapshot` is documented as absent from read tools even though `adv_change_show include.snapshot` returns it.
- `AGENTS.md` says 24 command files and JSON+SQLite storage despite 25 commands and Temporal-only runtime.

These contradictions cause agent confusion in exactly the places ADV uses as safety rails: gate IDs, worktree isolation, state-file access, and marker handling. The repair should align live instructions with shipped specs and implementation, not change implementation to match stale prose.