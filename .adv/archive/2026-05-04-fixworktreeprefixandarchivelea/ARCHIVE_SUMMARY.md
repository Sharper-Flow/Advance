# Archive: fixWorktreePrefixAndArchiveLeak

**Change ID:** fixworktreeprefixandarchivelea
**Archived:** 2026-05-04T03:25:48.215Z
**Created:** 2026-05-04T03:13:06.899Z

## Tasks Completed

- ✅ T1 — Fix branch-integration regex + add `+` prefix test

**File 1:** `plugin/src/utils/branch-integration.ts:152-153`
- Update comment to mention `+` prefix
- Change regex from `/^\*\s*/` to `/^[*+]\s*/`

**File 2:** `plugin/src/utils/branch-integration.test.ts`
- Insert new test "merged branches with worktree prefix (+ ) are normalized" after line 155
- Mirror the existing `*`-prefix test, change input to `["+ feature/test"]`, expect `ok: true`

**Verify:** `pnpm test src/utils/branch-integration.test.ts` — all tests pass including the new one.

**TDD intent:** inline — write the new test first (red, since regex still rejects `+`), then apply regex fix (green).

**Workdir:** worktree path
  > Red→green TDD: added new test for `+ ` prefix (red, failed with branch_not_merged), then changed regex from /^\*\s*/ to /^[*+]\s*/ (green, all 11 tests pass). Updated comment to document both prefix cases. Committed as ef8c96d.
- ✅ T2 — Verification

After T1 complete, run:
1. `pnpm test src/utils/branch-integration.test.ts` (focused — must include new test)
2. `pnpm test` (full suite — no regression)
3. `pnpm run check` (typecheck + lint + format)

**TDD intent:** not_applicable — verification only.

**Workdir:** worktree path / plugin
  > pnpm run check (typecheck + lint + format): clean. pnpm test (full): 3042 passed, 7 skipped, 0 failed. Test count increased by 1 (the new `+ ` prefix regression test from T1).
- ✅ T3 — Commit orphan archive bundle on trunk

Run from `$MAIN` (= `/home/jrede/dev/oc-plugins/advance`), NOT from the worktree:

```bash
git -C "$MAIN" add .adv/archive/2026-05-04-polishadvimprovecommanddoc/
git -C "$MAIN" commit -m "archive: polishadvimprovecommanddoc"
```

**Pre-conditions:**
- `git -C "$MAIN" branch --show-current` = `trunk`
- `git -C "$MAIN" status --porcelain` shows only `?? .adv/archive/2026-05-04-polishadvimprovecommanddoc/` (or empty if already cleaned)

**Verify:**
- `git -C "$MAIN" ls-files .adv/archive/2026-05-04-polishadvimprovecommanddoc/` returns 6 files
- `git -C "$MAIN" status --porcelain` is clean (or only shows fixworktreeprefixandarchivelea bundle if archive already ran)

**TDD intent:** not_applicable — git commit, no test logic.

**Workdir:** $MAIN (`/home/jrede/dev/oc-plugins/advance`), NOT the worktree.

**Note:** This task is intentionally outside the worktree because the orphan bundle exists at `$MAIN/.adv/archive/...` (where `adv_change_archive` writes per `change.ts:1834` `inRepoArchive = join(store.paths.root, ".adv", "archive")`). The bundle is not present in any worktree.
  > Committed orphan bundle on trunk in $MAIN as 32f54f8 (6 files, 398 insertions). Verified: `git ls-files .adv/archive/2026-05-04-polishadvimprovecommanddoc/` returns all 6 expected files. Note: unrelated peer-session WIP exists on plugin/src/tools/status.ts — not part of this change.

## Specs Modified

