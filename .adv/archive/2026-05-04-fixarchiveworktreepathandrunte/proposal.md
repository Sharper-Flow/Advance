## Goal

Resolve two real ADV tool bugs (#2 + #4) and document two procedural gotchas (#1 + #3) so future flows don't hit the same friction.

## Decisions (locked at proposal)

- **#2 fix approach:** Add optional `worktreePath` arg to `adv_change_archive`. When provided, in-repo bundle is written to `<worktreePath>/.adv/archive/<id>/` instead of `<store.paths.root>/.adv/archive/<id>/`. Backward-compatible: omitting the arg preserves current behavior.
- **#4 fix approach:** Add optional `timeoutMs` arg to `adv_run_test` schema. Validated to range `[1000, 300_000]` (1s floor, 5min cap). Default unchanged at 30_000.
- **#1 fix approach:** Add a "Source-vs-Dist Reload Gotcha" section to `AGENTS.md` § Development Commands.
- **#3 fix approach:** Add a "TDD Intent Default" subsection to `ADV_INSTRUCTIONS.md` § ADV MCP Tool Invocation.

## Scope

### In scope

1. **`plugin/src/tools/change.ts`** — extend `adv_change_archive` schema with `worktreePath: z.string().optional()`. In execute body, replace:
   ```typescript
   const inRepoArchive = join(store.paths.root, ".adv", "archive");
   ```
   with:
   ```typescript
   const inRepoBase = worktreePath ?? store.paths.root;
   const inRepoArchive = join(inRepoBase, ".adv", "archive");
   ```
2. **`plugin/src/tools/test.ts`** — extend `adv_run_test` schema with `timeoutMs: z.number().int().min(1000).max(300_000).optional()`. Plumb through to `effective.timeoutMs = args.timeoutMs ?? bounds?.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS`.
3. **Tests for #2:** add test in `plugin/src/tools/change.test.ts` covering `worktreePath` argument routing — bundle lands in passed path, not store root.
4. **Tests for #4:** add tests in `plugin/src/tools/test.test.ts` covering: (a) custom `timeoutMs: 60_000` is honored; (b) `timeoutMs: 300_001` is rejected by schema; (c) default unchanged when arg omitted.
5. **`AGENTS.md`** — add "Source-vs-Dist Reload Gotcha" section under § Development Commands documenting the rebuild-and-restart requirement for source changes to take effect, and pointing at `pnpm run build` + session restart as the workflow.
6. **`ADV_INSTRUCTIONS.md`** — add "TDD Intent Default" subsection under § ADV MCP Tool Invocation noting that `adv_task_add` defaults `metadata.tdd_intent` to `"inline"` and instructing agents to pass it explicitly for `"not_applicable"` and `"separate_verification"` cases.
7. **`/adv-archive` command doc** — Phase 6 step gets a small note: "When archiving from a worktree, pass `worktreePath: <worktree-root>` so the in-repo bundle lands in the worktree and Phase 9 Step 1 can stage it cleanly."

### Out of scope

- Changing `store.paths.root` semantics
- Hot-reload support for OpenCode plugins (platform-level)
- Auto-detecting worktree from process cwd (process cwd != tool invocation workdir in OpenCode)
- Removing or relaxing the validator's logic-heavy heuristic
- Auto-rebuild watch script for development workflow
- Changing `adv_run_test`'s default timeout from 30s
- Conformance / Phase 5.5 paths
- Migrating legacy `.adv/changes/` or `.adv/db/` directories

## Acceptance Criteria

1. `adv_change_archive` accepts optional `worktreePath: string`. When provided, `inRepoArchive` resolves under that path.
2. When `worktreePath` is omitted, behavior is byte-identical to current (regression test confirms).
3. `adv_run_test` accepts optional `timeoutMs: number` in `[1000, 300_000]`. When provided, the value is used as the wall-clock timeout.
4. `adv_run_test` schema rejects `timeoutMs: 300_001` and `timeoutMs: 999`.
5. `AGENTS.md` contains a "Source-vs-Dist Reload Gotcha" subsection (or equivalent heading) under § Development Commands.
6. `ADV_INSTRUCTIONS.md` contains a "TDD Intent Default" entry under § ADV MCP Tool Invocation.
7. `/adv-archive.md` Phase 6 references the new `worktreePath` arg.
8. `pnpm test` (full suite) passes — no regression. New tests added.
9. `pnpm run check` passes (typecheck + lint + format).
10. `pnpm run build` succeeds and the new args appear in `dist/index.js`.

## Success Criteria

- Future archive flows can run from a worktree, pass `worktreePath`, and have Phase 9 Step 1 work cleanly without `cp -r` workaround.
- Future verification tasks can run `pnpm run check` (or equivalent slow command) via `adv_run_test timeoutMs: 120_000` instead of falling back to `adv_task_evidence`.
- New ADV agent sessions that read `AGENTS.md` know to rebuild + restart after source changes.
- New ADV agent sessions that read `ADV_INSTRUCTIONS.md` pass explicit `tdd_intent` for non-default cases.

## Out of Scope (explicit)

- Behavioral changes to validator logic-heavy heuristic.
- Changes to default timeout or default tdd_intent (defaults remain 30_000ms and "inline").
- Plugin hot-reload — that's an OpenCode platform feature request.
- Multi-worktree session orchestration.