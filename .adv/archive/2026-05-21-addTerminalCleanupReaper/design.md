# Design — Add terminal cleanup reaper

## Architecture Overview

Implement one store-aware terminal worktree cleanup path for ADV terminal worktrees. The reaper owns candidate discovery and trigger routing only; deletion authority remains `advWorktreeDelete`.

Core shape:

1. Extract a shared pending-delete drain function in the worktree subsystem.
2. Route manual cleanup, startup pending-delete drain, archive cleanup, status-triggered cleanup, and best-effort `session.deleted` through that shared function.
3. Use full discovery only from non-startup triggers; startup drains known pending deletes only.
4. Reuse `advWorktreeDelete` for every removal attempt so archived/closed state, merged branch, clean worktree, and live-CWD checks stay structural.
5. Surface retained blockers as aggregates in `adv_status` and exact branch/path/blockers in `adv_worktree_triage`.

## Key Decisions

### KD-1: One shared drain primitive, not two cleanup loops

Extract the common loop duplicated between `advWorktreeCleanup` and `WorktreePlugin.processPendingDeletes`. The shared primitive is `drainPendingDeletes(trigger, deps: AdvWorktreeDeleteDeps, opts)` with dry-run and force-attempt behavior.

### KD-2: Deletion authority stays in `advWorktreeDelete`

The reaper must never run `git worktree remove` directly and must never treat `census.cleanupEligible` as sufficient authority. Candidate enumeration may be broad, but every actual deletion delegates to `advWorktreeDelete`.

### KD-3: Bounded startup, full discovery elsewhere

Startup drains only already-known pending deletes from the pending-delete queue. Manual cleanup, archive cleanup, and status may run full discovery using git worktree facts plus durable ADV store verification.

### KD-4: Reuse existing dependency contracts

Use `AdvWorktreeDeleteDeps` as the shared dependency bundle. Keep trigger behavior in an options object.

### KD-5: Pending-delete metadata evolves additively

Retained failures may add optional `lastError` and `lastErrorClass` fields to `PendingDelete`. This is additive and old JSON records remain readable.

### KD-6: Status aggregates; triage details

`adv_status` reports counts/classes only. `adv_worktree_triage` reports exact branches, paths, blockers, attempts, and remediation.

### KD-7: Archive scanner boundary

This change owns ADV worktree lifecycle cleanup. Adjacent archive cleanup/scanner changes own non-worktree archive artifacts and proof surfaces.

## Implementation Strategy

1. Extract shared pending-delete drain.
2. Route manual cleanup wrapper through it with `forceAttempts: true` and dry-run support.
3. Replace plugin-local `processPendingDeletes` with shared drain calls.
4. Add startup bounded drain of known pending deletes only.
5. Add full discovery triggers for manual/status/archive paths using git worktree facts and durable store terminal-state checks.
6. Extend status and triage visibility.
7. Add spec deltas and tests for lifecycle, safety, bounded startup, retries, idempotency, and visibility.

## LBP Analysis

Best long-term approach: centralize lifecycle orchestration and keep deletion authority in the existing structural primitive.

Rejected alternatives: direct reaper delete path, `/exit`-only cleanup, `census.cleanupEligible` as authority, full startup scan, and keeping duplicate cleanup loops.

## Affected Components

- `plugin/src/tools/worktree/index.ts`
- `plugin/src/tools/worktree/state.ts`
- `plugin/src/tools/worktree/triage.ts`
- `plugin/src/tools/worktree/census.ts`
- `plugin/src/tools/adv-worktree.ts`
- `plugin/src/tools/status.ts`
- `plugin/src/tools/change.ts`
- `plugin/src/utils/tool-formatters.ts`
- `.adv/specs/worktree-lifecycle`
- Worktree/status/asset tests

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Store unavailable during cleanup | Retain candidate, record blocker/error class, retry later; do not delete. |
| Concurrent triggers process same branch | Use existing pending-delete file lock and idempotent `advWorktreeDelete` result handling. |
| Startup becomes slow | Startup drains pending deletes only; no full discovery. |
| Cleanup deletes non-terminal worktree | Only `advWorktreeDelete` can delete; it verifies terminal ADV state for `change/*`. |
| Status becomes noisy | Status aggregates only; triage has exact details. |
| Archive scanner overlap | Document boundary and keep worktree cleanup owned here. |

## Validator Result

Validator: VALIDATED.

Findings:

- Correctness: design solves the objectives and directly addresses the duplicate-loop/store-awareness gap.
- Simplicity: a shared `drainPendingDeletes(trigger, deps, opts)` function is the simplest viable approach that also satisfies AC9.
- Spec-law compliance: compatible with `worktree-lifecycle` and `advance-workflow` release finalization requirements; proposed `rq-terminalCleanup*` deltas are additive.
- Alternatives: Temporal activity reaper, timer-based periodic reaper, full startup scan, and census-as-authority were considered and rejected.

Recommendation: proceed to planning.
