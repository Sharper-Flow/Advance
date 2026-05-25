# Executive Summary

## Outcome
Implemented a shared terminal worktree cleanup reaper for ADV.

## What changed
- Added worktree-lifecycle spec laws and guard tests for terminal cleanup triggers, safety, visibility, and single-path lifecycle.
- Extracted `drainPendingDeletes` as the shared pending-delete drain primitive.
- Routed manual cleanup, startup, `session.deleted`, status, and archive cleanup through shared cleanup behavior.
- Added full terminal cleanup discovery for manual/status/archive triggers, with durable store verification of `archived`/`closed` state before queueing candidates.
- Preserved structural deletion safety by delegating removals to `advWorktreeDelete`.
- Added retained cleanup visibility: `adv_status` reports counts/classes only; `adv_worktree_triage` reports exact branches/paths/blockers.
- Added retry metadata (`lastError`, `lastErrorClass`) for retained pending-delete failures.

## Verification
Passed:
- `pnpm run check`
- `pnpm test`
- `pnpm run build`
- Focused suites for worktree delete, triage, status, change archive/status hooks, and lifecycle asset guards.

## Review
Independent reviewer verdict: PASS after a scoped wording fix routing triage cleanup recommendations through `adv_worktree_delete` instead of manual deletion.