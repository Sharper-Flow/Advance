# Archive: Refactor provider agents

**Change ID:** refactorProviderAgents
**Archived:** 2026-05-19T18:32:41.036Z
**Created:** 2026-05-19T15:51:33.723Z

## Tasks Completed

- ✅ Amend advance-meta provider-agent specs for single ADV runtime
  > Updated `advance-meta` provider requirements from generated `adv-{provider}` runtime agents to a single complete `adv.md` runtime agent with runtime provider-hint injection. Amended provider metrics requirements and scoped ADV instruction requirement. Updated generated docs section and spec assertion coverage in `plugin/src/sync-global.test.ts`.
- ✅ Implement runtime provider hint injection in the ADV system block
  > Task checkpoint completed
- ✅ Simplify sync-global provider assembly to one ADV runtime agent
  > Reworked `sync-global.sh` to assemble one complete global `adv.md` runtime agent containing canonical ADV body plus `ADV_INSTRUCTIONS.md`, removed provider variant generation/prompt-ref/runtime-canary/drift logic, removed provider variant cleanup exemption, and added stale retired provider prompt cleanup. Updated sync/overlay tests for no generated provider runtime agents, stale provider cleanup, and no provider prompt config patching.
- ✅ Update provider evaluation metrics for single-agent architecture
  > Updated provider evaluation metrics for the single-agent architecture: canonical ADV prompt, ADV protocol instructions, provider hint, selected runtime prompt, and avoided retired provider variant file size. Removed generated_provider_file as a required/canonical metric and changed prompt composition so baseline includes canonical ADV plus ADV_INSTRUCTIONS, with provider hint added as runtime-style delta.
- ✅ Rewrite provider-agent docs and smoke checklist for manual migration
  > Replaced generated provider-agent assembly docs with single ADV runtime/provider-hint architecture; updated smoke checklist for retired provider agents, runtime hints, manual config cleanup, OMP follow-up boundary, metrics, and drift checks. Refreshed README and repo instructions to describe one `adv` orchestrator with runtime provider hints instead of provider-named agents. Updated a gate-boundary comment to avoid stale adv-gpt/adv-claude actor wording.
- ✅ Final verification for single ADV provider-agent refactor
  > Updated final verification assertions to match the single ADV runtime/provider-hint docs. Applied Prettier to touched TypeScript files. Fixed a full-suite git utility test flake by replacing callback-style `execFile('touch')` awaited as a promise with `fs/promises.writeFile`, ensuring README.md exists before git add during parallel full-suite execution. Verified the complete plugin check, test, and build path.

## Specs Modified

