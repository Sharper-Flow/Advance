# Archive: Fix git mutation guard blocking canonical archive push from default branch

**Change ID:** fixGitMutationGuardBlocking
**Archived:** 2026-05-09T21:07:40.153Z
**Created:** 2026-05-09T20:42:30.608Z

## Tasks Completed

- ✅ T1 RED/GREEN: add focused `git push origin main` pass-through regression assertions to `plugin/src/tools/trunk-write-firewall.test.ts` for both `classifyDestructiveBash` and `checkTrunkWriteBash`. TDD intent: inline; no production change expected unless test exposes mismatch.
  > Updated `plugin/src/tools/trunk-write-firewall.test.ts` to assert `classifyDestructiveBash("git push origin main")` returns no targets and `checkTrunkWriteBash` allows a chained git command including `git push origin main`. No production code change needed; current behavior already allowed the push path.
- ✅ T2 VERIFY: run `pnpm exec vitest run src/tools/trunk-write-firewall.test.ts` and `pnpm run check` from `plugin/`; fix in-scope failures only. TDD intent: separate_verification.
  > Ran targeted trunk-write firewall tests and repo check from `plugin/`. Targeted test passed 35/35; `pnpm run check` passed typecheck, test isolation, lint, and format check.

## Specs Modified

