# Executive Summary

## Outcome

Deploy-local tool-drift validation is now role-aware. Primary agents (`adv`, `adv-atc`) are no longer required to expose leaf-subagent-only `adv_subagent_report_submit`, while ordinary registered ADV tools remain strictly checked.

## Verdict

APPROVED

## What Was Built

1. Added deploy-local tests proving primary agents stay `mode: primary`, do not expose `adv_subagent_report_submit`, and require role-aware drift validation.
2. Updated `scripts/deploy-local.sh` to parse frontmatter `mode`, define `LEAF_ONLY_TOOLS`, and subtract leaf-only tools from required registered tools only for primary agents.
3. Preserved extras detection and ordinary missing-tool detection.

## What Was Verified

- Review: independent `adv-reviewer` verdict APPROVE; no findings.
- Tests/checks:
  - `pnpm test -- src/deploy-local.test.ts` passed.
  - `pnpm exec vitest run src/adv-engineer-assets.test.ts` passed.
  - `pnpm exec vitest run src/adv-reviewer-asset.test.ts` passed.
  - `./scripts/deploy-local.sh --check` passed with no tool-drift warnings for `adv.md`/`adv-atc.md`.
  - `bash -n scripts/deploy-local.sh` passed.
  - `pnpm run format:check` passed.
  - `pnpm run check` passed.
- Contract matrix: 8/8 pass/respected.

## Remaining Concerns

- `adv_change_validate strict:true` reports `NO_DELTAS` warning only; no blocking errors.