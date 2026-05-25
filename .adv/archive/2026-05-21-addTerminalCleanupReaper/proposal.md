# Add terminal cleanup reaper

## Intent

Add a shared, ADV-owned terminal worktree cleanup reaper so terminal-mode ADV worktrees are eventually cleaned after terminal/archive/session lifecycle events without relying on `/exit` as the only trigger.

## Problem

Terminal-mode worktrees can remain on disk after their owning changes are archived/closed because `session.deleted` is best-effort and previous cleanup paths only retried already-known pending deletes. Cleanup must be eventual, bounded at startup, observable, and still protected by the existing archived/closed + merged + clean + no-live-CWD deletion gate.

## Scope

- `plugin/src/tools/worktree/index.ts` — consolidate pending-delete/reaper drain paths and `session.deleted` behavior.
- `plugin/src/tools/worktree/state.ts` — pending-delete persistence/retry metadata.
- `plugin/src/tools/worktree/census.ts` / `plugin/src/tools/worktree/triage.ts` — candidate discovery and exact blocker visibility.
- `plugin/src/tools/status.ts` / `plugin/src/utils/worktree-census.ts` / `plugin/src/utils/tool-formatters.ts` — normal status counts/classes for retained terminal cleanup blockers.
- `plugin/src/tools/change.ts` — archive-triggered cleanup discovery.
- `.adv/specs/worktree-lifecycle` and worktree/status tests.

## Success Criteria

- Terminal ADV worktrees are eventually cleaned from archive, manual cleanup, status discovery, bounded startup retry, and best-effort `session.deleted`.
- Deletion always delegates to `advWorktreeDelete`; no parallel `git worktree remove` path is introduced.
- Cleanup safety remains structural: terminal change state from durable ADV state, branch merged to default, clean worktree, no live process CWD.
- Startup drains known pending deletes only; full terminal discovery does not block plugin initialization.
- Retained worktrees remain queued/preserved for retry and are visible as normal-status counts/classes plus triage exact branch/path/blockers.
- Duplicate lifecycle cleanup logic is consolidated into one shared path.
- Spec deltas and tests cover triggers, safety gates, bounded startup, retry/idempotency, concurrency, and visibility.

## Discovery Findings

- Current state: `advWorktreeDelete` already implements core safety and queues pending deletes when in use; `advWorktreeCleanup` drains pending deletes and delegates to it; `WorktreePlugin.processPendingDeletes` duplicated the loop and omitted `store`.
- Edge cases: in-use CWD, registry drift for `change/*`, transient store outage, dirty/unmerged branch, concurrent triggers, bounded startup.
- LBP: centralize safety-critical deletion through one store-aware path; census/triage are discovery/visibility only.
- Draft spec deltas: `rq-terminalCleanupReaper01`, `rq-terminalCleanupSafety01`, `rq-terminalCleanupVisibility01`, `rq-terminalCleanupLifecycle01`.
- Opportunity scout: auto-adopted store-aware shared path, duplicate-loop consolidation, census-not-authority, transient retry consideration; archive scanner overlap documented as boundary.
- Ambiguity analysis: no HIGH or CRITICAL findings remain. Coverage B:C F:C S:C M:C.
