# Fix worktree deletion reliability

## Root Cause Analysis

### Causal path 1: incomplete timeout envelope

`adv_worktree_delete` routes `target_path` through target resolution and authoritative store initialization before entering `executeWorktreeDelete`, where the internal 8-second race is armed. The host enforces a 10-second ceiling around the whole tool. If target resolution, project hashing, migration, lock acquisition, or store initialization consumes the margin, the host returns generic `ToolExecutionTimeout` before ADV can return typed state.

### Causal path 2: unbounded and non-cancellable inner operations

Worktree discovery includes Git helpers with 30-second defaults and `git status` calls without an explicit timeout. The internal race does not cancel these operations, so they may continue after the caller receives a timeout. Synchronous process-CWD scans can also delay the timer itself during live deletion.

### Causal path 3: wrong authority source

Deletion treats ADV registry membership as a prerequisite for integration proof. Git's worktree census remains authoritative for actual worktree existence, path, branch, and HEAD. Valid clean merged `release/*` worktrees therefore fail with `branch_not_in_registry` instead of receiving normal safety verification.

### Evidence

- Source trace: `withTargetPathStore` completes before the 8-second delete race is armed.
- Source trace: ungated worktree-list/rev-parse helpers use 30-second defaults; dirty-state Git calls have no timeout.
- Reproduction: one target-path dry run reached the host 10-second timeout; immediate rerun returned quickly.
- Reproduction: `release/fixPostRemovalRelease-v1203` consistently returns `branch_not_in_registry` despite Git reporting a real merged worktree.
- Control timings without contention: individual Git operations complete in 5-16 ms and store scan in roughly 0.6-0.9 seconds, showing the failure is contention-sensitive but structurally permitted.

## Direction

Replace registry-gated deletion with a Git-census-authoritative, two-phase deletion protocol:

1. Planning reads Git worktree census and emits a typed deletion plan containing exact repo, path, branch, HEAD SHA, cleanliness, process-use result, integration proof, expiry, and deterministic plan token.
2. Apply accepts that token, acquires a per-repository cleanup lock, re-reads all facts, rejects drift, then deletes.
3. One end-to-end budget covers target resolution, planning, hooks, workspace cleanup, Git removal, and state reconciliation.
4. All child processes receive the remaining deadline and are killed on expiry; no deletion work survives a timeout response.
5. ADV registry data is reconciled after Git proof but never required to discover or delete an otherwise safe Git-owned worktree.
6. Unknown, dirty, in-use, unmerged, drifted, or deadline-exhausted states fail closed with typed stage evidence.

## Scope

### In scope

- Worktree delete tool schema, handler, planner, executor, and typed result state machine.
- Target-project routing and total deadline propagation.
- Git worktree census, branch-integration proof, dirty/in-use checks, hooks, Git removal, registry reconciliation, and pending-delete cleanup.
- Cancellation/kill semantics for every child process and timeout path.
- Dry-run/apply token contract, drift revalidation, idempotence, and structured stage timing.
- Unit, integration, contention, timeout, non-`change/*` branch, and process-survival regressions.
- Cleanup of the retained release worktrees after the fixed tool is deployed.

### Out of scope

- Manual `git worktree remove` fallback.
- Longer host timeout as the primary fix.
- Background reapers or deletion that continues after the caller receives a response.
- Weakening dirty, in-use, branch-integration, archive, or process-CWD safety checks.
- PokeEdge launcher projection rebuild.

## Success boundary

- Dry-run and apply always return typed terminal output within the host budget.
- No subprocess or mutation continues after timeout response.
- Clean merged `change/*`, `release/*`, and ad-hoc branches are handled uniformly from Git census.
- Dirty, in-use, unmerged, or changed-after-plan worktrees are never deleted.
- Repeated delete is idempotent and reports already absent.
- Cleanup can remove the two retained release worktrees without manual `git worktree remove`.