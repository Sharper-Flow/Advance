# Archive: polishAdvImproveCommandDoc

**Change ID:** polishadvimprovecommanddoc
**Archived:** 2026-05-04T03:03:03.101Z
**Created:** 2026-05-04T02:41:47.832Z

## Tasks Completed

- ✅ M2 — Expand manifest successors for adv-improve

**File:** `plugin/src/manifest.ts:389`

**Edit:** Change `successors: ["adv-proposal"],` to `successors: ["adv-proposal", "adv-task", "adv-audit"],`

**Verify:** `pnpm test src/manifest.test.ts` passes (asserts successors is array of valid command names; `adv-task` and `adv-audit` both exist).

**TDD intent:** not_applicable — single-line config change covered by existing manifest tests.

**Workdir:** `/home/jrede/dev/oc-plugins/advance`
  > Added "adv-task" and "adv-audit" to successors array in manifest.ts:389. manifest.test.ts: 37/37 pass. Committed as 689eac8.
- ✅ H1+M3+M1 — Apply 3 edits to .opencode/command/adv-improve.md

Three independent edits to the same file. Apply in this order:

**Edit A (H1) — Lines 173-175:** Delete trailing `---` separator + `## Output` heading. File should end with the Key Tools table at line 171.

**Edit B (M3) — Line 88:** Replace `{year}` with `{current-year}` (both occurrences in the queries array).

**Edit C (M1) — Line 80:** Rewrite Phase 2 fallback paragraph to:
```
**Fallback:** If Context7 is absent → try `webfetch` against canonical docs URLs. If both Context7 and webfetch are unavailable → use local codebase conventions and annotate each finding with `[Reference: local conventions — Context7/webfetch unavailable]`. Do not fabricate canonical sources.
```

**Verify after all 3:**
- `wc -l .opencode/command/adv-improve.md` → ≤ 182
- `grep -c "{year}" .opencode/command/adv-improve.md` → 0
- `grep -c "^## Output" .opencode/command/adv-improve.md` → 0

**TDD intent:** not_applicable — doc edits covered by `adv-improve-assets.test.ts` (28 assertions verified preserved during discovery).

**Workdir:** `/home/jrede/dev/oc-plugins/advance`
  > Applied 3 edits to .opencode/command/adv-improve.md: H1 (deleted trailing ## Output heading + ---), M3 ({year} → {current-year}), M1 (Phase 2 fallback now Context7 → webfetch → local). Lines: 175→171. adv-improve-assets.test.ts: 30/30 pass. Committed as 36259924.
- ✅ Verification — Run full test + check suite

Final verification after both edit tasks complete.

**Commands (all from `plugin/`):**
1. `pnpm test src/adv-improve-assets.test.ts` — 28 assertions must pass
2. `pnpm test src/manifest.test.ts` — successors validity must pass
3. `pnpm run check` — typecheck + lint + format

**Acceptance criteria coverage:**
- AC1 (Output removed): grep verified in T2
- AC2 (M1 fallback ordering): visual review of diff
- AC3 (manifest successors): T1 + manifest.test.ts
- AC4 ({current-year}): grep verified in T2
- AC5 (adv-improve-assets passes): this task
- AC6 (check passes): this task
- AC7 (≤182 lines): wc verified in T2

**TDD intent:** not_applicable — verification-only task.

**Workdir:** `/home/jrede/dev/oc-plugins/advance/plugin`

**Blocked by:** previous two tasks
  > Verification suite passed: typecheck + lint + format (pnpm run check) all green; full test suite (3041 passed, 7 skipped, 0 failed). All 7 acceptance criteria satisfied.

## Specs Modified

