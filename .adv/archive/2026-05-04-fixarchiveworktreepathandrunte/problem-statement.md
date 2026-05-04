Two ADV tool ergonomics bugs surfaced during the previous archive flow plus two doc gaps. All four are independent but small enough to ship together.

### Bug #2 — `adv_change_archive` writes in-repo bundle to wrong location in worktrees

**Root cause** (`plugin/src/tools/change.ts:1834`):
```typescript
const inRepoArchive = join(store.paths.root, ".adv", "archive");
```

`store.paths.root` resolves to the project root (main checkout). Multi-worktree setups break: when `adv_change_archive` is invoked from a worktree, the bundle still lands in main's working tree where it can't be staged on the change branch.

**Impact:** `/adv-archive` Phase 9 Step 1 (stage `.adv/archive/<id>/` on change branch) cannot work cleanly. Agents must `cp -r` the bundle from main to worktree first, OR commit it on trunk after merge as a drive-by. Both worked in our last archive flow but neither matches Phase 9 Step 1's stated intent.

**Repro:** my previous archive — `adv_change_archive` returned `archivePath: ~/.local/share/.../archive/...` (external state, correct) but ALSO wrote `$MAIN/.adv/archive/2026-05-04-fixworktreeprefixandarchivelea/` (in-repo bundle, wrong location for worktree-based flow).

### Bug #4 — `adv_run_test` 30s timeout not exposable to caller

**Root cause** (`plugin/src/tools/test.ts:124-144`):
- `DEFAULT_TEST_TIMEOUT_MS = 30_000` is hardcoded
- Internal `bounds?.timeoutMs` override exists at line 187 but is **not in the tool schema args**
- Comment at lines 24-26 explicitly notes timeouts are "set internally (not via tool schema) to keep the public tool contract unchanged"

**Impact:** This repo's `pnpm run check` legitimately runs ~50s. Tool always times out at 30s. Forces fallback to `adv_task_evidence` after running externally. Other repos with slow integration tests / linters hit the same wall. The timeout is correct (anti-runaway); the inability to override it from the tool call is the friction.

### Doc gap #1 — Plugin reload latency

OpenCode loads plugins from `dist/index.js` at session startup; source edits don't take effect until rebuild + session restart. Currently undocumented in AGENTS.md. Trapped me end-to-end-validating my own `branch-integration.ts` fix in the previous change.

### Doc gap #3 — `tdd_intent` defaulting to `inline`

Plugin defaults `tdd_intent` to `inline` when `metadata` is omitted from `adv_task_add` (`task.ts:497-500`, intentional). Agents who want `not_applicable` or `separate_verification` must pass it explicitly. Description in `task.ts:426` mentions the example but the default isn't surfaced in `ADV_INSTRUCTIONS.md` or `AGENTS.md`. Trapped me when I created a verification-only task without metadata; validator flagged it at archive time and I had to use `adv_task_reclassify_tdd` to escape.