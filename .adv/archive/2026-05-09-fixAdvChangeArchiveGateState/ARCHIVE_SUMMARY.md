# Archive: Fix adv_change_archive gate-state mismatch when gate status reports archive-ready

**Change ID:** fixAdvChangeArchiveGateState
**Archived:** 2026-05-09T20:40:27.167Z
**Created:** 2026-05-09T18:12:01.230Z

## Tasks Completed

- ✅ T1 RED: add archive preflight regression tests in `plugin/src/tools/change.test.ts` for stale store gates with live complete gates and live incomplete gates. TDD intent: inline; red phase must fail before implementation.
  > Added tests in `plugin/src/tools/change.test.ts` for stale cached gates with live complete gates and live incomplete gates. The RED run failed before implementation, proving the regression is exposed.
- ✅ T2 GREEN: implement `resolveArchiveGateState` in `plugin/src/tools/change.ts`, use live `getGateStatusQuery` for archive gate preflight, keep conservative fallback, and enrich incomplete-gate diagnostics. TDD intent: inline; depends on T1 red tests.
  > Implemented `resolveArchiveGateState` in `plugin/src/tools/change.ts`, querying live `getGateStatusQuery` with the same adapter path as `adv_gate_status`, falling back to store gates, and enriching incomplete-gate diagnostics with source-specific fields. Updated tests now pass.
- ✅ T3 VERIFY: run targeted test `pnpm test -- src/tools/change.test.ts` and repo check `pnpm run check` from `plugin/`; fix in-scope failures. TDD intent: separate_verification.
  > Ran targeted archive tests and full repo check from `plugin/`. Initial check failed on Prettier formatting for `src/tools/change.ts`; formatted changed files and reran. Final verification passed: targeted tests 17/17 and `pnpm run check` green.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** Full `pnpm test` currently fails on trunk and worktree for pre-existing environment-sensitive tests unrelated to touched files: overlay runtime canary PATH expectation and trunk-write firewall integration tests timing out at 5s during Temporal worker startup. Targeted change tests, `pnpm run check`, and build pass.
