# Archive: Strengthen ADV provider delegation hints

**Change ID:** strengthenAdvProvider
**Archived:** 2026-05-04T07:27:43.391Z
**Created:** 2026-05-04T06:56:37.813Z

## Tasks Completed

- ✅ Update Claude/GLM provider delegation hints with inline TDD. Red: add targeted asset assertion proving Claude no longer contains anti-delegation wording and both Claude/GLM contain hyphenated `adv-engineer` delegation-routing guidance. Green: update `.opencode/agent-parts/providers/claude.md` and `glm.md` so Claude replaces conflicting line, GLM adds guidance, both stay <=20 lines, and no `adv_engineer` spelling appears.
  > Added provider-hint asset test for Claude/GLM delegation guidance. Replaced Claude anti-delegation hint with delegation-routing-aware `adv-engineer` preference. Added matching GLM `adv-engineer` delegation guidance. Verified targeted asset test passes.
- ✅ Run provider assembly verification. Execute targeted provider-hint asset tests and `scripts/sync-global.sh --check` where environment permits. Record exact pass/fail output or blocker; fix only in-scope provider hint/test issues discovered by verification.
  > Ran targeted provider-hint asset test successfully (52 tests). Ran `scripts/sync-global.sh --check`; first combined command hit provider runtime canary timeout, rerun passed all ADV config/tool drift/runtime canary checks.

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** In fresh ADV worktrees, `plugin/node_modules` may be absent even when main checkout has deps; install with `pnpm install --frozen-lockfile` before worktree-local Vitest. For targeted Vitest in this repo, `pnpm exec vitest run <file>` is more reliable than `pnpm test -- <file>` because the latter expanded into broader test execution during this run.
- **[gotcha]** `scripts/sync-global.sh --check` runtime canary can transiently time out on a single provider (`adv-claude timed out after 30s`) while static tool drift checks pass. Rerun the check separately before classifying as failure; in this run the next `--check` resolved all 4 provider prompts and passed.
