# Archive: Add optimizer command

**Change ID:** addOptimizerCommand
**Archived:** 2026-06-26T18:21:06.616Z
**Created:** 2026-06-26T17:11:32.086Z

## Tasks Completed

- ✅ Implement /adv-optimizer command contract, manifest registration, docs, and structural tests
  > Added `.opencode/command/adv-optimizer.md` as a read-only prompt-only utility command with target resolution, first-level explore scanner fan-out, source-evidence requirement, proposal-shaped output, degraded execution, and no-mutation/no-deletion boundaries. Registered `adv-optimizer` in `plugin/src/manifest.ts`, updated `plugin/src/manifest.test.ts` command count/list, added `plugin/src/adv-optimizer-assets.test.ts`, and updated README, ADV_INSTRUCTIONS, and docs/cli-surface-matrix.md rows. Verified with targeted Vitest suite.
- ✅ Run final targeted verification and readiness checks for /adv-optimizer
  > Final verification plus review cleanup complete. The command contract now has a single plain `ADV State Mutation: none` anchor. Targeted tests and static boundary checks passed; reviewer nit addressed without adding CLI runner, new agent, or mutation surface.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** For targeted Vitest verification in this repo, `pnpm test -- <files>` can still trigger broad/unrelated test execution in some contexts; use `pnpm exec vitest run <files>` (or repo wrapper where appropriate) for precise file-scoped evidence when recording task-level GREEN results.
- **[gotcha]** Existing Markdown docs/tables in this repo may not be whole-file Prettier-normalized. Avoid running `prettier --write` over README/ADV_INSTRUCTIONS/docs matrix solely for a small row addition; it creates unrelated table churn. Prefer structural drift tests plus TS formatting, and keep Markdown edits minimal unless a change explicitly owns doc formatting.
