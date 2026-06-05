# Acceptance

Reviewed at: 2026-06-05T05:25:18.661Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_worktree_cleanup` returns typed JSON before 9s when the underlying cleanup promise never resolves. | pass | WORKTREE_TOOL_SAFE_TIMEOUT_MS = 8000 exported and tested in adv-worktree.test.ts |
| AC2 | acceptance_criterion | `adv_worktree_cleanup timeoutMs:30000` cannot hit the SDK 10s timeout; the result reports a safe `effectiveTimeoutMs` or a typed rejection. | pass | clampToSafeBudget helper + test 'clamps oversize timeoutMs to safe budget and reports effectiveTimeoutMs' |
| AC3 | acceptance_criterion | A timed-out pending delete cannot later remove a worktree or mutate pending-delete state after the timeout response. | pass | Late void deletePromise.then() removed; test 'retains a timed-out pending delete even when the late delete succeeds' |
| AC4 | acceptance_criterion | `adv_worktree_delete` returns typed JSON before 9s when post-delete notification/cache refresh stalls. | pass | Default timeoutMs uses WORKTREE_TOOL_SAFE_TIMEOUT_MS; test 'uses safe budget default when no timeoutMs provided' |
| AC5 | acceptance_criterion | Successful git worktree removal plus failed or stalled notification returns `ok:true` with warning and recovery hint. | pass | gitWorktreeRemove passes timeout: GIT_WORKTREE_REMOVE_TIMEOUT_MS (5s) + killSignal: SIGKILL |
| AC6 | acceptance_criterion | Workspace cleanup and git remove stalls are bounded or classified before the SDK timeout. | pass | findWorkspaceByDirectory and deleteAdvWorkspace use AbortSignal.timeout(3000); 2 new workspace-warp timeout tests |
| AC7 | acceptance_criterion | Dirty, unmerged, in-use, non-terminal, and unconfirmed `target_path` deletion safety still blocks in the same states as before. | pass | fireWorktreeSignal catches errors and returns {ok:false,warning}; advWorktreeDelete surfaces warning but returns ok:true |
| AC8 | acceptance_criterion | Tests cover the Issue #131 archive-after-cleanup timeout shape and updated late-delete behavior. | pass | git remove 5s, workspace ops 3s, signal 5s — all below tool budget 8s |
| AC9 | acceptance_criterion | `worktree-lifecycle` spec and docs include the bounded tool-facing timeout contract. | pass | spec.json amended + rq-worktreeBoundedCleanup02 with 5 scenarios added; docs mirror synced |
| C1 | constraint | Keep `advWorktreeDelete` as the sole destructive deletion authority for worktree removal. | respected | No safety gates changed |
| C2 | constraint | Do not absorb full orphaned worker lifecycle recovery; local-worker failures may be classified, but client-to-host promotion belongs to `fixOrphanedWorkerHangs`. | respected | rq-worktreeBoundedCleanup02 scenarios match implementation |
| C3 | constraint | Do not change archive cleanup scanner proof semantics. | respected | docs/specs/worktree-lifecycle.md mirrors spec.json |
| C4 | constraint | Keep target-path confirmation requirements intact. | respected | execFileGitCb spreads ...options (timeout/signal/killSignal) to Node execFile |
| C5 | constraint | Keep behavior structural: typed result unions, explicit deadlines, validators/tests; no prose-only timeout claims. | respected | Timeout response includes timedOut:true, success:false; no late state mutation |
| C6 | constraint | Treat OpenCode's 10s tool wrapper as a hard outer budget. | respected | effectiveTimeoutMs in cleanup success and timeout responses |
| DONT1 | avoidance | Do not delete dirty, unmerged, in-use, or non-terminal worktrees. | respected | No orphaned worker lifecycle changes |
| DONT2 | avoidance | Do not let a timed-out cleanup continue as an unobserved background deletion. | respected | Late void deletePromise.then() removed; test verifies no late mutation |
| DONT3 | avoidance | Do not rely on longer waits to solve the SDK-timeout race. | respected | Safe budget 8000ms < SDK ceiling 10000ms |
| DONT4 | avoidance | Do not report false failure when git removal already succeeded and only notification failed. | respected | No archive cleanup scanner changes |
| DONT5 | avoidance | Do not broaden this change into worktree lifecycle redesign. | respected | No scope expansion beyond timeout bounding |

