# Archive: Remove bun-types from main tsconfig to prevent Node type shadowing

**Change ID:** removeBunTypesMainTsconfig
**Archived:** 2026-05-07T16:05:53.356Z
**Created:** 2026-05-04T19:47:02.778Z

## Tasks Completed

- ✅ Remove bun-types from plugin/tsconfig.json types array
  > Task checkpoint completed
- ✅ Add /// <reference types="bun-types" /> to Bun-specific source files
  > Added /// <reference types="bun-types" /> compiler directive to plugin/src/temporal/runtime-manager.ts, plugin/src/tools/worktree/index.ts, and plugin/src/tools/worktree/terminal.ts (the three files that legitimately use Bun globals: Bun.spawn, Bun.spawnSync, Bun.file, Bun.write, Bun.sleepSync). All other files lose Bun ambient access (enforced by Task 1's tsconfig change + Task 3's ESLint rule). Committed alongside Tasks 1 and 3 in commit 2a958af per user direction (single combined commit). Verified by Task 4 — typecheck passes against rebased trunk (HEAD 8869d24 + this commit).
- ✅ Add ESLint no-restricted-globals rule to block Bun usage outside allowed files
  > Added no-restricted-globals ESLint rule to plugin/eslint.config.js:23 blocking direct use of `Bun` global, with a per-file override for the 3 Bun-specific files (src/temporal/runtime-manager.ts, src/tools/worktree/terminal.ts, src/tools/worktree/index.ts) where the rule is set to "off". Locks the policy: Bun APIs may only be used in files that explicitly opt in via the corresponding /// <reference> markers from Task 2. Committed in commit 2a958af alongside Tasks 1 and 2 per user direction (single combined commit). Verified by Task 4 — `pnpm run lint` passes with the rule active and the 3 allowlisted files still lint-clean.
- ✅ Verify: typecheck, lint, format:check, test pass
  > Verification meta-task. Ran full pipeline against the Tasks 1-3 combined commit (2a958af) on rebased branch (HEAD 8869d24): pnpm run check passed (typecheck + test-isolation + lint + format:check, exit 0); pnpm test passed (1786 pass, 2 skipped, 0 fail, 145 test files, 28.13s). Bun-types removed from main tsconfig types array. Three Bun-specific files have /// <reference types="bun-types" /> markers. ESLint no-restricted-globals: Bun rule active with 3-file allowlist override. No regressions.

## Specs Modified

