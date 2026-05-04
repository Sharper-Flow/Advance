## Design

Mechanical change with locked decisions. 4 distinct surfaces.

### Edit 1 — `adv_change_archive` `worktreePath` arg

**File:** `plugin/src/tools/change.ts`

**At schema args (lines 1745-1753):** add `worktreePath: z.string().optional()` with describe text "Optional absolute path to a git worktree where the in-repo bundle should be written. Defaults to the project root (main checkout). Used by /adv-archive Phase 9 Step 1 to land bundles on the change branch."

**At execute params (lines 1754-1757):** destructure `worktreePath` from args.

**At line 1834:** replace single line with two:
```typescript
const inRepoBase = worktreePath ?? store.paths.root;
const inRepoArchive = join(inRepoBase, ".adv", "archive");
```

### Edit 2 — `adv_change_archive` test

**File:** `plugin/src/tools/change.test.ts`

Add new test in the archive describe block:

```typescript
test("worktreePath routes in-repo bundle to passed path", async () => {
  // Setup: create change, archive with worktreePath pointing to a temp worktree dir
  // Assert: bundle exists at <worktreePath>/.adv/archive/<id>/, NOT at store.paths.root/.adv/archive/
});

test("worktreePath omitted preserves default behavior", async () => {
  // Setup: archive without worktreePath
  // Assert: bundle exists at store.paths.root/.adv/archive/<id>/ (current behavior)
});
```

### Edit 3 — `adv_run_test` `timeoutMs` arg

**File:** `plugin/src/tools/test.ts`

**At schema args (lines 124-144):** add `timeoutMs: z.number().int().min(1000).max(300_000).optional()` with describe text "Optional wall-clock timeout in milliseconds. Default 30000. Range [1000, 300000]. Use for slow commands like full test suites or `pnpm run check`."

**At execute params (lines 146-154):** add `timeoutMs?: number`.

**At line 187:** change:
```typescript
timeoutMs: bounds?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
```
to:
```typescript
timeoutMs: args.timeoutMs ?? bounds?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
```

### Edit 4 — `adv_run_test` tests

**File:** `plugin/src/tools/test.test.ts`

Add three tests:
```typescript
test("custom timeoutMs is honored", async () => {
  // Run with timeoutMs: 60_000; assert effective timeout is 60s, not 30s default
});

test("timeoutMs above 300_000 is rejected by schema", async () => {
  // Schema parse fails for timeoutMs: 300_001
});

test("timeoutMs below 1000 is rejected by schema", async () => {
  // Schema parse fails for timeoutMs: 999
});
```

### Edit 5 — `AGENTS.md` Source-vs-Dist gotcha

**File:** `AGENTS.md`

Insert new subsection after the `## Development Commands` block (around line 90):

```markdown
### Source-vs-Dist Reload Gotcha

OpenCode loads the plugin from `dist/index.js` at session startup and caches it in process memory. Source edits to `src/` do NOT take effect in the current session.

To validate a source change end-to-end:

1. `pnpm run build` — regenerates `dist/index.js`
2. Restart the OpenCode session (or restart the plugin host)
3. Re-invoke the affected tool

For this reason, agent-driven changes that modify ADV tool behavior should:
- Verify the source fix via unit/integration tests in the same session (TDD red→green)
- Defer end-to-end validation to a fresh session after rebuild
- Document the rebuild requirement in the change's archive notes
```

### Edit 6 — `ADV_INSTRUCTIONS.md` TDD intent default

**File:** `ADV_INSTRUCTIONS.md`

Insert new bullet under § ADV MCP Tool Invocation (after the `adv_task_cancel` bullet):

```markdown
- `adv_task_add` — `metadata.tdd_intent` defaults to `"inline"` when omitted. Pass it explicitly for `"separate_verification"` (cross-cutting verify tasks) or `"not_applicable"` (docs/config/verification-only tasks). Validator's logic-heavy heuristic flags missing TDD evidence on tasks defaulted to `inline` regardless of content prose; explicit metadata avoids `adv_task_reclassify_tdd` ceremony at archive time.
```

### Edit 7 — `/adv-archive.md` Phase 6 note

**File:** `.opencode/command/adv-archive.md`

At Phase 6 (line 134-136), update to:

```markdown
## Phase 6: Execute Archive

`adv_change_archive changeId: <target>` — applies deltas, updates SQLite, generates docs, moves to archive.

When archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands in the worktree's `.adv/archive/` directory and Phase 9 Step 1 can stage it on the change branch without `cp -r` workarounds.
```

### Verification plan

| Step | Command | Expected |
|---|---|---|
| 1 | `pnpm test src/tools/change.test.ts` | All tests pass including 2 new |
| 2 | `pnpm test src/tools/test.test.ts` | All tests pass including 3 new |
| 3 | `pnpm test` | Full suite ≥ 3045 passed |
| 4 | `pnpm run check` | typecheck + lint + format clean |
| 5 | `pnpm run build` | `dist/index.js` rebuilt; new args grep-findable |

### Validator skip rationale

Mechanical change. Two schema additions + two doc additions + one cross-reference. Zero new design surface. All decisions locked at proposal.

### Ordering

Tasks should execute roughly in this order to keep TDD red→green cycles clean:
- T1 — Edit 1 + 2 (change.ts + change.test.ts) — TDD red→green
- T2 — Edit 3 + 4 (test.ts + test.test.ts) — TDD red→green
- T3 — Edit 5 + 6 + 7 (AGENTS.md + ADV_INSTRUCTIONS.md + adv-archive.md) — doc only, no TDD
- T4 — Verification (full suite + check + build)