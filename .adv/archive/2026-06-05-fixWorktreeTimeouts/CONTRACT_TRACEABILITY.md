# Contract Traceability

**Change ID:** fixWorktreeTimeouts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-05T05:25:18.661Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | WORKTREE_TOOL_SAFE_TIMEOUT_MS = 8000 exported and tested in adv-worktree.test.ts |
| AC2 | acceptance_criterion | pass | test | clampToSafeBudget helper + test 'clamps oversize timeoutMs to safe budget and reports effectiveTimeoutMs' |
| AC3 | acceptance_criterion | pass | test | Late void deletePromise.then() removed; test 'retains a timed-out pending delete even when the late delete succeeds' |
| AC4 | acceptance_criterion | pass | test | Default timeoutMs uses WORKTREE_TOOL_SAFE_TIMEOUT_MS; test 'uses safe budget default when no timeoutMs provided' |
| AC5 | acceptance_criterion | pass | test | gitWorktreeRemove passes timeout: GIT_WORKTREE_REMOVE_TIMEOUT_MS (5s) + killSignal: SIGKILL |
| AC6 | acceptance_criterion | pass | test | findWorkspaceByDirectory and deleteAdvWorkspace use AbortSignal.timeout(3000); 2 new workspace-warp timeout tests |
| AC7 | acceptance_criterion | pass | test | fireWorktreeSignal catches errors and returns {ok:false,warning}; advWorktreeDelete surfaces warning but returns ok:true |
| AC8 | acceptance_criterion | pass | test | git remove 5s, workspace ops 3s, signal 5s — all below tool budget 8s |
| AC9 | acceptance_criterion | pass | test | spec.json amended + rq-worktreeBoundedCleanup02 with 5 scenarios added; docs mirror synced |
| C1 | constraint | respected | static_check | No safety gates changed |
| C2 | constraint | respected | static_check | rq-worktreeBoundedCleanup02 scenarios match implementation |
| C3 | constraint | respected | static_check | docs/specs/worktree-lifecycle.md mirrors spec.json |
| C4 | constraint | respected | static_check | execFileGitCb spreads ...options (timeout/signal/killSignal) to Node execFile |
| C5 | constraint | respected | static_check | Timeout response includes timedOut:true, success:false; no late state mutation |
| C6 | constraint | respected | static_check | effectiveTimeoutMs in cleanup success and timeout responses |
| DONT1 | avoidance | respected | review | No orphaned worker lifecycle changes |
| DONT2 | avoidance | respected | review | Late void deletePromise.then() removed; test verifies no late mutation |
| DONT3 | avoidance | respected | review | Safe budget 8000ms < SDK ceiling 10000ms |
| DONT4 | avoidance | respected | review | No archive cleanup scanner changes |
| DONT5 | avoidance | respected | review | No scope expansion beyond timeout bounding |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-d079cbddbeec | AC1, AC2, AC4, C5, C6 | AC1, AC2, AC4 | C4, DONT3 |  |
| tk-b2bc0d08d63d | AC3, C1, C5 | AC3, AC8 | DONT2, DONT5 |  |
| tk-d0dbd449b688 | AC5, AC6, AC7, C1, C4, C5, C6 | AC5, AC6, AC7, AC8 | DONT1, DONT4, DONT5 |  |
| tk-b2b80e9f3ef7 | AC9 | AC9 | C2, C3, DONT5 |  |
| tk-9e982940f1fd |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
