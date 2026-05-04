## Agreement

### Objectives

Fix systematic `adv_worktree_delete` false-negative + commit orphan archive bundle. Two narrow, independent fixes.

### Discovery Findings

**Already-gathered evidence (in problem statement):**

| Issue | Evidence |
|---|---|
| #1 regex bug | `branch-integration.ts:153` regex `/^\*\s*/` only handles `*` prefix |
| #1 git behavior | `git branch --merged trunk` from main shows `+ change/...` for branches in worktrees |
| #1 repro | Direct `adv_worktree_delete` call returned `branch_not_merged` after verified ff-merge |
| #2 untracked | `git status --porcelain` shows `?? .adv/archive/2026-05-04-polishadvimprovecommanddoc/` |
| #2 intent | `.gitignore:60` whitelists `!.adv/archive/20*-*`; 50+ prior bundles in `git ls-files` |
| #2 commit pattern | `git log --diff-filter=A -- .adv/archive/` shows `archive: <slug>` style |

**Prior Research Extension:** No `docs/*-prep.md` packs cover branch-integration or git porcelain prefix handling. Audit-derived findings serve as primary evidence.

**LBP Check:**
- Test pattern: existing `*` prefix test at `branch-integration.test.ts:139-155` is the LBP — mirror its structure.
- Regex: `[*+]` character class is canonical for matching either of two leading prefix chars.
- Commit message: matches repo convention from `git log --diff-filter=A -- .adv/archive/`.

**Risk assessment:**
- #1 fix: zero risk. Regex change is strictly broadening (now matches both prefixes; behavior on no-prefix lines unchanged). Existing test at line 139 still passes.
- #2 fix: zero risk. Single tracked-file commit, no new files outside the bundle. `.gitignore` already whitelists the path.

### Acceptance

(See proposal § Acceptance Criteria — 8 items.)