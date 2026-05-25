# Executive Summary

Patched ADV sub-agent packet-defect handling so typed workers no longer ask users for orchestrator-owned context fields.

## Outcome

- Top-level ADV policy now requires typed worker prompts to include `WORKING DIRECTORY`, `CHANGE`, `TASK`, and `ATTEMPT`; `adv-reviewer` typed workers also require `PHASE`.
- Top-level ADV policy now says missing typed-worker packet identity fields are internal packet defects: retry with corrected packet or continue inline; never ask the user.
- `adv-reviewer` and `adv-engineer` prompts now return structured `packet_defect` failures for missing packet identity fields or `WORKING DIRECTORY` instead of calling `question`.
- Asset tests pin the recurrence guard.

## Verification

- Focused tests passed: `pnpm exec vitest run src/adv-task-assets.test.ts src/adv-reviewer-asset.test.ts src/adv-engineer-assets.test.ts` — 3 files, 110 tests.
- `pnpm run check` passed after formatting-only remediation.
- Contract review matrix recorded 10 rows with 0 failing rows.