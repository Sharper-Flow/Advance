# Executive Summary

ADV runtime command guidance no longer points agents at Advance source/install checklist files for reusable methodology. Runtime commands now use embedded methodology sections or existing loaded skills, and the boundary is enforced by asset tests plus `advance-meta` spec law.

## What changed

- Removed runtime `docs/checklists/*` directives from `adv-proposal`, `adv-discover`, `adv-prep`, `adv-review`, `adv-harden`, and `adv-improve`.
- Added a forbidden-pattern command asset test for source/install checklist-read directives.
- Updated `adv-improve` asset expectations to validate skill/fallback methodology instead of a checklist path.
- Added `rq-noSourceChecklistReads01` to `advance-meta` and mirrored docs.
- Updated `ADV_INSTRUCTIONS.md` so checklist docs are maintainer/reference docs, not runtime canonical sources.

## Verification

- `pnpm exec vitest run src/adv-skill-backed-commands-assets.test.ts src/adv-improve-assets.test.ts --reporter=dot` — 2 files, 83 tests passed.
- `pnpm run check` — typecheck, test-isolation check, lockfile policy check, lint, and format check passed.
- Runtime command scans for `docs/checklists/` and `~/.local/share/Advance` returned no matches.
- Independent reviewer verdict: APPROVED / READY, no findings.

## Remaining notes

- Live OpenCode runtime still needs normal build/deploy sync and a fresh session before updated command files are used globally.
- Duplicate proposal prevention is tracked separately as agenda `ag-wg8YdGFm`.
