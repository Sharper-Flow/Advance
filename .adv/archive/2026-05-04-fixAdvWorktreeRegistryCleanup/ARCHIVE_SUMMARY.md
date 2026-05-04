# Archive: Fix ADV worktree registry cleanup drift

**Change ID:** fixAdvWorktreeRegistryCleanup
**Archived:** 2026-05-04T02:15:31.907Z
**Created:** 2026-05-04T01:36:05.976Z

## Tasks Completed

- ✅ T1 — Add canonical change-branch inference helper. Implement `inferChangeIdFromBranch(branch)` near worktree state/branch utilities. Return non-empty suffix for `change/<id>`, otherwise undefined. Add focused unit tests for valid, empty, and non-change branches. TDD intent: inline. Delegation hint: inline_required.
  > Added `inferChangeIdFromBranch(branch)` in `tools/worktree/state.ts`, returning non-empty suffixes for canonical `change/<id>` branches and undefined for empty/non-change branches. Added focused helper tests. Verification: RED failed with helper missing; GREEN `pnpm exec vitest run src/tools/worktree/state-session-lifecycle.test.ts` passed 7 tests.
- ✅ T2 — Populate `changeId` in worktree registry write paths. Update primary create, inline-mode registration, forked-session registration, legacy migration `addSession`, and direct git-census workflow update to pass explicit or inferred change id. Add tests that registry update payloads contain expected `changeId`. TDD intent: inline. Delegation hint: inline_required.
  > Updated primary `advWorktreeCreate`, inline-mode registration, forked-session registration, legacy SQLite migration `addSession`, and git-census adoption to populate inferred `changeId` for canonical `change/<id>` branches. Added tests proving create and migration registry update payloads include changeId. Verification: RED failed with undefined/omitted changeId; GREEN `pnpm exec vitest run src/tools/worktree/index-create.test.ts src/tools/worktree/migration.test.ts` passed 13 tests.
- ✅ T3 — Add triage visibility for registry entries missing change id. Extend `OrphanClass`/triage output with `registry_missing_change_id` for `change/...` registry records without `changeId`, including safe diagnostic recommended fix text. Add tests. TDD intent: inline. Delegation hint: inline_required.
  > Extended worktree triage with `registry_missing_change_id` for canonical `change/...` registry records lacking owning `changeId`, including safe diagnostic remediation text. Added focused triage regression test. Verification: RED failed because class was absent; GREEN `pnpm exec vitest run src/tools/worktree/triage.test.ts` passed 6 tests.
- ✅ T4 — Final verification and related scan. Run focused worktree/branch integration/triage tests, related scan for remaining `addSession(... branch ... path)` or `addWorktreeSessionUpdate` calls without change id, then `pnpm run check`, `pnpm test`, and `pnpm run build` from `plugin/`. TDD intent: separate_verification. Delegation hint: delegate_allowed.
  > Ran focused verification for state helper, worktree create registration, migration adoption, triage, and branch integration. Related scan reviewed `addSession(` and `addWorktreeSessionUpdate` call sites; remaining registry writes include inferred change id or are definitions/tests/benchmark. Formatted touched files. Verification passed: `pnpm run check`, full `pnpm test` (164 files passed, 2 skipped; 2990 tests passed, 5 skipped), and `pnpm run build`.

## Specs Modified

