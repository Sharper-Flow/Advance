# Archive: Enhance scanner coverage

**Change ID:** enhanceScannerCoverage
**Archived:** 2026-05-22T14:38:07.039Z
**Created:** 2026-05-21T05:14:38.090Z

## Tasks Completed

- ✅ Extend slop-scan deletion contracts and asset coverage
  > Added slop-scan asset tests for rq-ss010 deletion candidate taxonomy, rq-ss011 deletion safety/user-review boundary, and rq-ss012 scanner coverage reporting. Updated slop-scan spec JSON and docs mirror, command contract, slop detection skill docs, CATEGORIES/DEAD_CODE guidance, and slop-smells MAINT-003 deletion_candidate subtypes. Preserved existing rq-ss001..rq-ss009 boundaries and low-confidence/context protections.
- ✅ Extend arch-scan stack-pack contracts and asset coverage
  > Added arch asset tests for rq-archstack01 stack packs before fallback, rq-archstack02 initial ADV stack pack, and rq-archcov01 architecture coverage reporting. Updated arch spec JSON and docs mirror, adv-arch-scan command contract, and arch detection skill docs. The ADV stack pack cites workflow bundle boundary, command/manifest symmetry, spec/asset anchors, and command/skill methodology surfaces as structural owners.
- ✅ Refresh scanner discoverability surfaces
  > Added a manifest test locking scanner descriptions to coverage-oriented wording. Updated adv-slop-scan and adv-arch-scan descriptions across manifest, command frontmatter, README, and ADV_INSTRUCTIONS. Manifest/doc drift tests now pass.
- ✅ Run scanner contract validation suite
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For targeted Vitest runs in this repo, `pnpm exec vitest run src/<file>.test.ts` gives isolated file execution; `pnpm test -- src/<file>.test.ts` can surface unrelated high-signal failures through the package script/tool output path, so use the exact vitest command when validating a single asset test.
- **[pattern]** Scanner contract changes are efficient when implemented as spec/command/skill/docs + asset-test anchors in one vertical slice per scanner requirement. The existing `*-assets.test.ts` pattern is enough to lock requirement IDs, command anchors, and skill methodology without adding a new runtime subsystem.
- **[success]** Manifest/doc drift tests already enforce scanner description consistency across manifest, command frontmatter, README, and ADV_INSTRUCTIONS. For discoverability changes, add a focused manifest expectation first, then rely on `manifest-doc-drift.test.ts` to propagate exact wording.
- **[success]** For scanner contract changes, a compact final verification suite can combine the two scanner asset tests with manifest and manifest-doc drift tests, then `pnpm run check` for full type/lint/format coverage. This catches spec-command-skill-doc drift without needing the full Vitest suite.
