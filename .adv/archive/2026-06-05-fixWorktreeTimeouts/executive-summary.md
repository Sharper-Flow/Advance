# Executive Summary: fixWorktreeTimeouts

## What Was Built

Fixed timeout behavior in `adv_worktree_cleanup` and `adv_worktree_delete` tool wrappers so both return bounded typed results before OpenCode's 10s SDK `safeExecute` ceiling, eliminating ambiguous late background mutation after timeout responses.

## Root Cause

Budget inversion: per-item default 30s exceeded the SDK's 10s hard ceiling; `withTimeout()` does not abort the underlying promise; `drainPendingDeletes()` late `void deletePromise.then(...)` branch cleared state after the tool had already reported timeout to the agent.

## Key Changes

1. **Central safe budget** — `WORKTREE_TOOL_SAFE_TIMEOUT_MS = 8000ms` constant exported from `adv-worktree.ts`; caller oversize values clamped automatically
2. **Tool wrapper bounding** — both `executeWorktreeDelete` and `executeWorktreeCleanup` use `Promise.race` against the safe budget; timeout returns typed `{timedOut: true}` response with `effectiveTimeoutMs`
3. **Late mutation removed** — `drainPendingDeletes` no longer attaches `void deletePromise.then(...)` after timeout; pending-delete records are retained for retry
4. **Internal bounding** — `gitWorktreeRemove` gets 5s timeout with SIGKILL; workspace find/delete use `AbortSignal.timeout(3000ms)`; post-delete signal timeout reduced from 10s to 5s
5. **Spec updated** — `rq-worktreeBoundedCleanup01.1` amended; new `rq-worktreeBoundedCleanup02` with 5 scenarios covering safe budget, clamping, no-late-mutation, git-bounded, and workspace-bounded behavior

## Verification

- 110/110 tests pass (28 adv-worktree + 41 index-delete + 41 workspace-warp)
- 6 new tests added across 3 test files
- Typecheck clean
- Contract review matrix: 20/20 items verified (9 AC + 6 constraints + 5 avoidances)
- 4 commits on `change/fixWorktreeTimeouts` branch

## Files Changed

- `plugin/src/tools/adv-worktree.ts` — safe budget constant, clamp helper, bounded tool wrappers
- `plugin/src/tools/adv-worktree.test.ts` — 4 new tests
- `plugin/src/tools/worktree/index.ts` — late mutation removed, git remove bounded, signal timeout reduced
- `plugin/src/tools/worktree/index-delete.test.ts` — inverted late-success test
- `plugin/src/utils/workspace-warp.ts` — AbortSignal.timeout on workspace ops
- `plugin/src/utils/workspace-warp.test.ts` — 2 new timeout tests
- `.adv/specs/worktree-lifecycle/spec.json` — spec updated
- `docs/specs/worktree-lifecycle.md` — docs mirror synced