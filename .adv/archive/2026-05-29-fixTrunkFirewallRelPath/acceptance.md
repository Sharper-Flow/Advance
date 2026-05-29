# Acceptance

Reviewed at: 2026-05-29T02:44:19.317Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | **REL-path ALLOW when worktree exists**: When `state.activeChange.id` is set, the session `directory` is the main checkout, and a registered git worktree at `change/{changeId}` exists under the ADV worktree base path, relative file paths in `write`/`edit`/`morph_edit` resolve against the worktree path instead of the session directory, and the firewall correctly ALLOWs them. | pass | integration.test.ts:REL path allowed when active change has worktree — resolves against worktree, firewall ALLOWs |
| AC2 | acceptance_criterion | **REL-path BLOCK when no worktree**: When no worktree exists for the active change, relative paths continue to resolve against session directory (trunk) and are BLOCKED as before. | pass | integration.test.ts:REL path blocked when no worktree exists — falls back to session dir, firewall BLOCKs |
| AC3 | acceptance_criterion | **ABS-path semantics unchanged**: Absolute paths to trunk are BLOCKED; absolute paths to worktrees are ALLOWED — regardless of active change state. | pass | !isAbsolute(targetPath) guard ensures ABS paths skip worktree resolution; test verifies ABS to trunk still BLOCKED |
| AC4 | acceptance_criterion | **Bash unchanged**: Bash path resolution already uses `workdir` correctly — no changes needed. | pass | git diff shows zero changes to bash-related code; 3366 existing tests pass |
| AC5 | acceptance_criterion | **Regression tests pass**: Investigation test matrix (23 cases) passes as permanent coverage. | pass | trunk-write-firewall.regression.test.ts: 23-case behavior matrix, all pass |
| AC6 | acceptance_criterion | **Existing integration tests pass**: No regressions in existing firewall tests. | pass | Full suite: 3366 tests pass, 0 regressions |
| C1 | constraint | Fix scope: `plugin/src/index.ts` `tool.execute.before` hook only (~15 lines changed). | respected | Only plugin/src/index.ts changed — 3 files total diff confirms |
| C2 | constraint | No changes to `trunk-write-firewall.ts` (firewall logic is correct). | respected | git diff trunk-write-firewall.ts: zero changes |
| C3 | constraint | No changes to bash path handling (already works). | respected | No bash-related files in diff |
| C4 | constraint | No new dependencies. | respected | No new imports from external packages — join, existsSync, getWorktreeBase all existing |
| DONT1 | avoidance | Do not make the path resolution "smart" (guessing agent intent from file content, etc.). | respected | Pure structural check: rel path + isMainCheckout + changeId + existsSync — no content/intent parsing |
| DONT2 | avoidance | Do not add a `workdir` parameter to `write`/`edit`/`morph_edit` (OpenCode SDK change, out of scope). | respected | No workdir/workdir parameter added to any tool |
| DONT3 | avoidance | Do not change firewall semantics for absolute paths. | respected | !isAbsolute guard means ABS paths always use session directory — firewall semantics unchanged |
| DONT4 | avoidance | Do not touch the `worktree_isolation_guard` or `worktree_auto_manage` modules. | respected | No changes to worktree_isolation_guard or worktree_auto_manage modules |

