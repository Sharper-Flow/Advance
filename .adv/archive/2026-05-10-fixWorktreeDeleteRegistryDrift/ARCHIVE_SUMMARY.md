# Archive: Fix worktree delete registry drift

**Change ID:** fixWorktreeDeleteRegistryDrift
**Archived:** 2026-05-10T01:54:48.222Z
**Created:** 2026-05-09T22:31:05.449Z

## Tasks Completed

- ✅ T1 RED/GREEN: add missing-registry `change/*` delete regression coverage in `plugin/src/tools/worktree/index-delete.test.ts`, then implement narrow recovery in `plugin/src/tools/worktree/index.ts`. Include success archived+merged+clean/no-force, no-store fail-closed, unarchived block, unmerged block, and dirty block. TDD intent: inline.
  > Added missing-registry `change/*` worktree delete regression coverage and implemented a narrow recovery path in `advWorktreeDelete`. Recovery requires inferred change id, durable Store/Temporal change status `archived`, merged-to-default verification, then existing clean/hook/remove flow. Kept non-ADV force path unchanged and fail-closed when Store is unavailable.
- ✅ T2 VERIFY: run `pnpm exec vitest run src/tools/worktree/index-delete.test.ts src/utils/branch-integration.test.ts` and `pnpm run check` from `plugin/`; fix only in-scope failures. TDD intent: separate_verification.
  > Ran targeted worktree delete/branch integration tests and full `pnpm run check` from `plugin/`. Targeted tests passed 31/31; check passed typecheck, test isolation, lockfile policy, lint, and format check. No additional file changes.

## Specs Modified

