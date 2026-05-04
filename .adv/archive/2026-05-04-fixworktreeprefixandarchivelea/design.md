## Design

Mechanical change with locked decisions and exact-edit recipes.

### Edit 1 — Regex fix (Issue #1)

**File:** `plugin/src/utils/branch-integration.ts:152-153`

**Current:**
```typescript
  // Normalize branch names: git may prefix with "* " for current branch
  const normalizedMerged = merged.map((b) => b.replace(/^\*\s*/, "").trim());
```

**Target:**
```typescript
  // Normalize branch names: git may prefix with "* " for current branch
  // or "+ " for branches checked out in another worktree
  const normalizedMerged = merged.map((b) => b.replace(/^[*+]\s*/, "").trim());
```

### Edit 2 — Regression test (Issue #1)

**File:** `plugin/src/utils/branch-integration.test.ts`

**Insert after line 155** (after the existing `*`-prefix test):

```typescript
  it("merged branches with worktree prefix (+ ) are normalized", async () => {
    const result = await verifyBranchIntegration(
      "feature/test",
      "/fake/repo",
      {},
      makeDeps({
        mergedBranches: async () => ["+ feature/test"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      branch: "feature/test",
      changeId: "change-abc123",
      defaultBranch: "main",
    });
  });
```

### Edit 3 — Commit orphan bundle (Issue #2)

Run from `$MAIN` (= `/home/jrede/dev/oc-plugins/advance`):

```bash
git -C "$MAIN" add .adv/archive/2026-05-04-polishadvimprovecommanddoc/
git -C "$MAIN" commit -m "archive: polishadvimprovecommanddoc"
```

The bundle directory contents (already on disk):
- `ARCHIVE_SUMMARY.md` (3.3K)
- `agreement.md` (2.3K)
- `change.json` (7.6K)
- `design.md` (2.8K)
- `problem-statement.md` (1.9K)
- `proposal.md` (3.2K)

### Verification plan

| Step | Command | Expected |
|---|---|---|
| 1 | `pnpm test src/utils/branch-integration.test.ts` | All tests pass including new `+` test |
| 2 | `pnpm test` (full suite) | 3041+ passed, 0 failed |
| 3 | `pnpm run check` | typecheck + lint + format pass |
| 4 | `git ls-files .adv/archive/2026-05-04-polishadvimprovecommanddoc/` | 6 files |
| 5 | `git status --porcelain` (in $MAIN) | empty after both fixes merged |
| 6 | Live integration: archive this change → `adv_worktree_delete` returns `ok: true` | Validates fix end-to-end |

### Validator skip rationale

No architectural surface. Single regex character change + mirror test + manual git commit. Zero LBP/best-practice tradeoffs.

### Ordering

Tasks must execute in this order:
1. Regex fix + new test (T1, T2 on same file pair)
2. Verification (T3)
3. Commit orphan bundle (T4 — done from main checkout, NOT in worktree)

Note: T4 specifically targets the main checkout, not the worktree. The orphan bundle exists at `$MAIN/.adv/archive/...` and must be committed to trunk directly. After this change's own archive lands, T4's commit will be present on trunk alongside this change's archive bundle.