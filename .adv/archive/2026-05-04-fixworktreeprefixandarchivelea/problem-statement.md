Two distinct issues surfaced during the previous archive flow:

### Issue #1 — `adv_worktree_delete` always reports `branch_not_merged` for ADV-managed worktrees

**Root cause.** `plugin/src/utils/branch-integration.ts:153`:
```typescript
const normalizedMerged = merged.map((b) => b.replace(/^\*\s*/, "").trim());
if (!normalizedMerged.includes(branch)) {
  return fail("branch_not_merged", ...);
}
```

`git branch --merged <defaultBranch>` output uses three prefix conventions:
- ` ` (no prefix) — regular branch
- `*` — current branch in this worktree
- `+` — branch checked out in another worktree

The normalize regex strips `*` but not `+`. When `adv_worktree_delete` runs, the target branch is by definition checked out in the worktree being deleted, so it appears as `+ change/<id>` in `git branch --merged trunk` output. After normalize it's still `+ change/<id>`, which fails the equality check against `change/<id>`.

**Repro (verified):**
```bash
$ git -C $MAIN merge --ff-only change/polishadvimprovecommanddoc
Updating 9f6d1e4..3625992
Fast-forward
$ git -C $MAIN log --oneline trunk..change/polishadvimprovecommanddoc | wc -l
0  # fully merged
$ adv_worktree_delete branch: "change/polishadvimprovecommanddoc"
{"ok":false,"error":"INTEGRATION_REQUIRED","reason":"branch_not_merged",...}
```

**Impact.** `adv_worktree_delete` is broken for the canonical use case. Every ADV change that uses a worktree (which AGENTS.md says is mandatory) hits this when archiving. Users either (a) hit the false-negative and fall back to manual `git worktree remove`, or (b) report bug. Existing test at `branch-integration.test.ts:139` covers `*` prefix but not `+`.

### Issue #2 — Most recent archive bundle is untracked in main

**Root cause.** Procedural — agent skipped `/adv-archive` Phase 9 Step 1 (stage + commit `.adv/archive/{date-id}/` on change branch before merge) and went straight from `adv_change_archive` to `git merge`. The bundle was created by `adv_change_archive` but never committed.

**State:**
```
$ git -C $MAIN status --porcelain
?? .adv/archive/2026-05-04-polishadvimprovecommanddoc/

$ ls .adv/archive/2026-05-04-polishadvimprovecommanddoc/
ARCHIVE_SUMMARY.md  agreement.md  change.json
design.md  problem-statement.md  proposal.md
```

`.gitignore` line 60 explicitly whitelists `!.adv/archive/20*-*` — these bundles ARE meant to be tracked. `git ls-files .adv/archive` confirms 50+ prior bundles are committed.

**Impact.** Single missing commit on trunk for the polishadvimprovecommanddoc archive. No data loss (external state at `~/.local/share/.../archive/...` is intact). Just needs to be staged and committed.

### Out of scope

- Legacy `.adv/changes/` (127 dirs, 1.8M, pre-Temporal-cutover, gitignored)
- Legacy `.adv/db/` (500K, gitignored)
- Tension between `adv_migrate_cleanup` (wants to delete `.adv/archive/`) and repo's intentional tracking of archive bundles
- Hardening the archive flow so Phase 9 Step 1 can't be skipped procedurally