# Archive: fixArchiveWorktreePathAndRunTestTimeout

**Change ID:** fixarchiveworktreepathandrunte
**Archived:** 2026-05-04T03:54:05.880Z
**Created:** 2026-05-04T03:36:58.592Z

## Tasks Completed

- ✅ T1 — Add `worktreePath` arg to `adv_change_archive` (Edit 1 + 2)

**Files:**
- `plugin/src/tools/change.ts` — add schema arg, destructure, replace inRepoArchive resolution (per design Edit 1)
- `plugin/src/tools/change.test.ts` — add 2 tests (worktreePath honored / omitted preserves default)

**TDD:** inline. Write red test for `worktreePath` routing (fails because current impl uses store.paths.root unconditionally) → implement fix → green.

**Verify:** `pnpm test src/tools/change.test.ts` passes including new tests.

**Workdir:** worktree path
  > Added optional worktreePath arg to adv_change_archive. When provided, in-repo bundle lands at <worktreePath>/.adv/archive/<id>/. Default behavior (no arg) preserved. 2 tests added covering both paths. Red→green TDD verified.
- ✅ T2 — Expose `timeoutMs` arg in `adv_run_test` (Edit 3 + 4)

**Files:**
- `plugin/src/tools/test.ts` — add schema arg with `[1000, 300000]` range, plumb through to effective timeout (per design Edit 3)
- `plugin/src/tools/test.test.ts` — add 3 tests (custom honored / cap rejection / floor rejection)

**TDD:** inline. Write red test for custom 60s timeout (fails because schema rejects unknown arg) → implement fix → green. Cap/floor tests are pure schema validation.

**Verify:** `pnpm test src/tools/test.test.ts` passes.

**Workdir:** worktree path
  > Added optional timeoutMs arg to adv_run_test schema with z.number().int().min(1000).max(300_000). Plumbed through to effective.timeoutMs with precedence: arg > internal bounds > default. 5 new tests cover: custom value honored, cap rejection, floor rejection, boundary acceptance, optional/undefined.
- ✅ T3 — Doc additions (Edit 5 + 6 + 7)

**Files:**
- `AGENTS.md` — add "Source-vs-Dist Reload Gotcha" subsection under § Development Commands (per design Edit 5)
- `ADV_INSTRUCTIONS.md` — add `adv_task_add` `tdd_intent` default bullet under § ADV MCP Tool Invocation (per design Edit 6)
- `.opencode/command/adv-archive.md` — Phase 6 note about `worktreePath` (per design Edit 7)

**TDD:** not_applicable — doc only.

**Workdir:** worktree path
  > Doc additions covering all 4 friction items: AGENTS.md gets Source-vs-Dist Reload Gotcha subsection (#1); ADV_INSTRUCTIONS.md ADV MCP Tool Invocation block expanded with adv_task_add tdd_intent default (#3), adv_change_archive worktreePath usage (#2), adv_run_test timeoutMs usage (#4); .opencode/command/adv-archive.md Phase 6 references worktreePath arg (#2).
- ✅ T4 — Verification

After T1-T3 complete:
1. `pnpm test` — full suite must pass (≥ 3047 expected: 3042 prior + 5 new from T1/T2)
2. `pnpm run check` — typecheck + lint + format clean
3. `pnpm run build` — dist regenerated
4. `grep -c "worktreePath" plugin/dist/index.js` — > 0
5. `grep -c "timeoutMs" plugin/dist/index.js` — increased from baseline

**TDD:** not_applicable — verification only.

**Workdir:** worktree/plugin
  > All 10 ACs satisfied. pnpm test: 3049/3056 (was 3042 baseline + 7 new). pnpm run check: clean. pnpm run build: dist regenerated, worktreePath × 48, timeoutMs × 46 in dist/index.js.

## Specs Modified

