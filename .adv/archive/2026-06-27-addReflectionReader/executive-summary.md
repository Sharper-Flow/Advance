# Executive Summary — Add reflection reader

## Outcome

ADV now has a safe read path for reflection reports and cross-project wisdom mining. Agents can inspect current-project or `target_path` project learnings without direct ADV state-file reads.

## What shipped

- Added read-only `adv_reflection_list` with bounded source-backed summaries.
- Reflection list output includes `entries`, `count`, `total`, `omitted`, `byFrictionCategory`, and exact `bySuggestion` counts.
- Added reflection filters for `changeId`, friction `category`, `scope`, `maxEntries`, and `target_path`.
- Added `target_path` support to `adv_project_wisdom_list` and `adv_wisdom_list` using read-only snapshot routing.
- Registered `adv_reflection_list` across public tool surfaces, frozen tool list, CLI matrix, and tool-title mapping.
- Reviewer remediation: `adv_wisdom_list target_path + changeId` stays on disk snapshot reads instead of live Temporal lookup.

## Verification

- Targeted reflection/wisdom/storage/target-project/registry/CLI/title tests passed: 97 tests across 10 files.
- Reviewer verification passed: wisdom-target regression, scoped reflection/wisdom/registry/CLI tests, and `pnpm run check`.
- `pnpm run check` passed.

## Remaining concerns

- None blocking. `bySuggestion` is exact string counting, intentionally not semantic clustering.