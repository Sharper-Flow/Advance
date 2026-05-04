# Agreement

## Objectives

1. Make external-state file layout flat and migrate nested reflections safely.
2. Prevent and surface synthetic test-state leaks; existing cleanup is dry-run first.
3. Reap empty worktree branch parents safely.
4. Deprecate physical `db/` allocation without breaking existing configs.
5. Make worktree paths XDG-compliant while preserving sibling layout.
6. Add read-only tree-wide disk hygiene reporting.
7. Add path guard parity for XDG-derived ADV paths.
8. Fix archived-change listing to de-dupe by canonical `change.id`.

## Acceptance Criteria

1. External reflections path resolves flat to `{ext}/reflections.jsonl`; no `{ext}/.adv/reflections.jsonl` created.
2. Normal `pnpm test` leaves zero net synthetic-prefix dirs created by that run.
3. Existing leaked/dead disk artifacts are reported dry-run first; deletion requires explicit approval.
4. `worktree_delete change/foo` removes empty `worktree/{pid}/change/` parent when safe.
5. `ProjectPaths` no longer exposes/allocates physical `db`; `db_dir` only remains as deprecated config compatibility if needed.
6. Worktree path resolution respects `XDG_DATA_HOME` while preserving `opencode/worktree/{pid}` sibling layout.
7. Hygiene output reports synthetic-prefix counts and current-project dead artifacts read-only.
8. XDG path guards reject relative or namespace-escaping paths.
9. Archived change listing returns one row per canonical `change.id`; no duplicates from `{date}-{changeId}` bundle dirs.
10. Tests cover all invariants; existing suite passes.

## Constraints

- Existing disk-artifact cleanup is dry-run first; deletion requires explicit approval.
- Worktree path shape remains sibling layout under `opencode/worktree/{pid}`.
- `worker.lock` / `worker.lock.releasing` lifecycle remains out of scope.
- `db_dir` compatibility must not break existing `project.json` files unless design proves a safe deprecation path.
- In-repo `.adv/specs/` semantics are unchanged.

## Avoidances

Do not auto-delete pre-existing user disk artifacts; do not introduce a second worktree location; do not rebuild legacy SQLite cache behavior as runtime dependency; do not expand into unrelated Temporal worker liveness or gate/task behavior.

## Decisions

### User Decisions
1. Cleanup posture: dry-run first.
2. Worktree path: XDG-only compatibility.
3. F9 duplicate archived-list bug: include in this change.

### Agent Decisions (LBP)
1. Use Vitest `globalSetup`/teardown for run-level cleanup.
2. Preserve `db_dir` as deprecated compatibility field unless design proves hard removal safe.
3. De-dupe archived listings by canonical `change.json.id`.
4. Add shared XDG resolver guard for absolute and namespace-safe paths.

## Deferred Questions

Exact reflections merge de-dupe key; exact synthetic-dir run registry; `recover-db.js` stub-vs-delete; archive duplicate bundle selection policy.

## Sign-Off

Acceptance criteria approved by user with reply `approve` on 2026-05-04.
