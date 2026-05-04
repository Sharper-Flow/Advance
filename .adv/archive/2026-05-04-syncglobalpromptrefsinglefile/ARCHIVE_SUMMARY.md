# Archive: syncGlobalPromptRefSingleFile

**Change ID:** syncglobalpromptrefsinglefile
**Archived:** 2026-05-04T05:24:00.559Z
**Created:** 2026-05-04T02:44:15.993Z

## Tasks Completed

- ✅ [TDD: inline] Strengthen provider prompt-ref regression coverage for `scripts/sync-global.sh`: prove `--fix` writes single-file refs, `--check` rejects legacy multi-file refs/stale concatenated prompts, runtime canary warns/continues when `opencode` is unavailable, and prompt-only provider config does not activate provider mode. If existing tests already cover a criterion, tighten assertions instead of duplicating coverage.
  > Updated `plugin/src/overlay-sync-assets.test.ts` with runtime canary unavailable coverage. Verified `pnpm exec vitest run src/overlay-sync-assets.test.ts` and `pnpm exec vitest run src/sync-global.test.ts src/overlay-sync-assets.test.ts`. Checkpoint commit 392922d48571deeadb38347d9c2ef5e444f9c0d6.
- ✅ [TDD: not_applicable] Repair direct provider-ADV prompt-ref documentation drift only where found: provider assembly docs, smoke checklist, generated spec docs/spec JSON if a law gap exists, and adjacent developer docs only when they directly contradict the single-file prompt-ref model. Include the validator's optional clarity note near `check_provider_prompt_parts()` only if code inspection confirms the comment improves maintainability.
  > Changed `docs/provider-agent-assembly.md`, `docs/provider-adv-smoke-checklist.md`, and `scripts/sync-global.sh`. Verified `pnpm exec vitest run src/sync-global.test.ts src/overlay-sync-assets.test.ts`. Checkpoint commit 3ad61bcdb366f14d3f0229765a2bc32e240e2cb3.
- ✅ [TDD: separate_verification] Run final focused and stack verification for provider ADV prompt assembly: focused sync tests (`pnpm test -- src/sync-global.test.ts src/overlay-sync-assets.test.ts`), `pnpm run check`, and broader test/build verification if focused changes or failures require it. Record exact commands and outcomes.
  > Final verification/remediation: added `--check` stale concatenated provider prompt integration test, removed unused `single_ref` local, and verified `pnpm exec vitest run src/sync-global.test.ts src/overlay-sync-assets.test.ts` (85 tests), `pnpm run check`, and `pnpm run build`. Final clean HEAD 4a149efa077ab50f89c93401498e92d06399e9be.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** In ADV worktrees, `plugin/node_modules` may be absent even when main checkout has dependencies; run `pnpm install` in the worktree before task tests. When simulating missing `opencode`, filter only `.opencode` PATH entries so `python`/toolchain shims remain available.
