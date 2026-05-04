## Goal

Fix the systematic `adv_worktree_delete` false-negative so ADV-managed worktrees can be deleted by their owning command (not manual fallback), and commit the orphaned archive bundle from the previous change.

## Decisions

- **Issue #1 fix scope:** regex change only. Strip both `*` and `+` prefixes. Add one regression test covering the `+` case. Update inline comment so the contract is documented.
- **Issue #2 fix scope:** one-shot — stage and commit the existing untracked archive bundle on trunk. Do NOT change the archive flow protocol; Phase 9 Step 1 is correct, agents (including me) must follow it.

## Scope

### In scope

1. **`plugin/src/utils/branch-integration.ts:153`** — change regex from `/^\*\s*/` to `/^[*+]\s*/`. Update the comment on line 152 from "git may prefix with `* ` for current branch" to "git may prefix with `* ` for current branch or `+ ` for branches checked out in another worktree".
2. **`plugin/src/utils/branch-integration.test.ts`** — add test "merged branches with worktree prefix (`+ `) are normalized" mirroring the existing `*`-prefix test (line 139). Use the same `makeDeps` helper.
3. **Stage + commit orphan archive bundle on trunk:**
   ```
   git -C $MAIN add .adv/archive/2026-05-04-polishadvimprovecommanddoc/
   git -C $MAIN commit -m "archive: polishadvimprovecommanddoc"
   ```
   Commit message style matches existing pattern from `git log --diff-filter=A -- .adv/archive/` (e.g. `archive: fixAdvWorktreeRegistryCleanup`, `archive: cleanupadvfolderingdebt`).

### Out of scope

- Reworking `adv_worktree_delete` retry logic (the regex fix alone resolves the symptom)
- Changing the `verifyBranchIntegration` API surface or return shape
- Changing `/adv-archive` Phase 9 to auto-commit the bundle (existing protocol is correct; agent compliance is the issue, not code)
- Cleaning up legacy `.adv/changes/` (127 stale dirs) or `.adv/db/` (500K)
- Reconciling `adv_migrate_cleanup` with the repo's intentional `.adv/archive/` tracking
- Adding a runtime check that warns when Phase 9 Step 1 is skipped
- Backfilling commits for any other untracked archive bundles (only the polishadvimprovecommanddoc bundle is affected per `git status`)

## Acceptance Criteria

1. `branch-integration.ts:153` regex strips both `*` and `+` prefixes.
2. `branch-integration.test.ts` contains a new test covering `+ <branch>` input that asserts `ok: true`.
3. `pnpm test src/utils/branch-integration.test.ts` passes (existing tests + new one).
4. `pnpm run check` passes (typecheck + lint + format).
5. `pnpm test` (full suite) passes — no regression.
6. Manual integration verification: in a worktree, after a successful ff-merge into trunk, `adv_worktree_delete branch: "change/<id>"` returns `ok: true` (no `branch_not_merged` false-negative).
7. `.adv/archive/2026-05-04-polishadvimprovecommanddoc/` is tracked on trunk (`git ls-files .adv/archive/2026-05-04-polishadvimprovecommanddoc/` returns 6 files).
8. `git -C $MAIN status --porcelain` is clean after both fixes are applied + merged + archived.

## Success Criteria

- Future archive flows where the agent calls `adv_worktree_delete` after a verified merge succeed without manual fallback to `git worktree remove`.
- The polishadvimprovecommanddoc archive bundle is preserved in trunk history alongside prior archive bundles.
- Zero regression in existing test suite (3041+ passing).

## Out of Scope (explicit)

- Behavioral changes to the broader worktree lifecycle.
- Strategic decisions about whether `.adv/archive/` should remain in-repo (vs external-only).
- Cleaning legacy `.adv/changes/` or `.adv/db/` directories.