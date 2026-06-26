# Archive: Improve tron guidance

**Change ID:** improveTronGuidance
**Archived:** 2026-06-26T19:46:10.449Z
**Created:** 2026-06-26T19:06:53.866Z

## Tasks Completed

- ✅ Add Tron guidance contract asset tests
  > Extended plugin/src/adv-tron-assets.test.ts with semantic asset assertions and helper utilities. Verified the test fails against old guidance and passes after guidance assets were updated. Checkpoint commit 78ed06770979b176eedc98a6d912472cbb79ecba recorded.
- ✅ Update Tron command, agent, and skill guidance
  > Updated .opencode/command/adv-tron.md, .opencode/agents/adv-tron.md, and skills/adv-tron/SKILL.md. Preserved TRON_REPORT transport and denied mutation boundaries; made optimizer/slop/arch routing primary and /adv-audit optional for explicit spec-vs-implementation drift. Verification: bin/oc-test targeted -- src/adv-tron-assets.test.ts passed. Checkpoint clean at 78ed06770979b176eedc98a6d912472cbb79ecba.
- ✅ Verify Tron guidance update
  > Ran final verification commands: bin/oc-test targeted -- src/adv-tron-assets.test.ts src/optimized-handoff-assets.test.ts src/skill-loading-policy-assets.test.ts (passed, 19 tests) and pnpm run format:check (passed). Checkpoint commit 8915a9e39339e6b7c74645d42e1d0ebae882281c recorded.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** `bin/oc-test targeted -- ...` delegates to Vitest from `plugin/`, so test filters should be plugin-relative (`src/adv-tron-assets.test.ts`) rather than repo-root paths (`plugin/src/...`); repo-root filters produce `No test files found`.
