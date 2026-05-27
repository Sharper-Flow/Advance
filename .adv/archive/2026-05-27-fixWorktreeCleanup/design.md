# Design

## Architecture Overview

Fix the cleanup hang at the two places where the current flow can wait without a local bound:

1. **Post-delete workflow notification** — `advWorktreeDelete` has already removed the git worktree, then awaits `fireWorktreeSignal(...)`. This notification/cache-refresh path must become bounded and warning-producing, not success-blocking.
2. **Queued pending-delete drain** — `advWorktreeCleanup` iterates queued deletes sequentially. Each item must have a local timeout so one wedged delete is retained and the loop continues.

The design keeps destructive safety gates exactly where they are today: integration checks, dirty-work checks, in-use checks, pre-delete hooks, post-hook rechecks, and missing-registry recovery all run before deletion. Bounds are added only around non-authoritative follow-up work and per-item cleanup execution.

## Key Decisions

1. **Return typed notification outcome from `fireWorktreeSignal`.** Use existing `withTimeout`; return success/warning instead of throwing after deletion. Add injectable timeout seams for tests.
2. **Enrich successful delete output with warnings.** `AdvWorktreeDeleteResult` already supports `warning?: string`, so no public discriminant change is needed.
3. **Bound each cleanup queue item.** Timeout means retain item, increment attempts, log warning, and continue to later items.
4. **Do not consume attempts for in-use skips.** Being in use is not a failed delete attempt; retain without incrementing.
5. **Delegate plugin cleanup/event path to `advWorktreeCleanup`.** Avoid duplicated pending-delete loops and keep worktree_cleanup/session.deleted behavior on the same bounded implementation.
6. **Reconcile late timeout success.** If a timed-out delete later succeeds or the path disappears, clear the queued record asynchronously.
7. **Add report-only worktree drift to `/adv-cleanup`.** Reuse `adv_worktree_triage`; group drift as safe, blocked, dirty/in-use, and needs-investigation. `--execute` remains report-only for worktrees.
8. **Make bounded cleanup spec-law.** Add `rq-worktreeBoundedCleanup01` to `worktree-lifecycle` and mirror docs.

## Implementation Strategy

1. Tests first:
   - Bounded post-delete signal/cache refresh returns success with warning.
   - Bounded cleanup retains timed-out item, increments attempts, and processes later entries.
   - In-use cleanup skips do not increment attempts.
   - Late timeout success clears stale pending-delete records.
   - Retry cap and force-attempt bypass are covered.
   - Dirty/in-use/unmerged safety gates remain blocking.
   - Cleanup command/skill assets include report-only worktree drift grouping.
   - Spec/docs mirror includes `rq-worktreeBoundedCleanup01`.
2. Implement bounded signal helper in `plugin/src/tools/worktree/index.ts` with `withTimeout` / `TimeoutError` and default constants.
3. Wire delete warning propagation through existing success `warning` field.
4. Wrap each `advWorktreeDelete` call in `advWorktreeCleanup` with per-item timeout handling.
5. Route `processPendingDeletes` through `advWorktreeCleanup`.
6. Update `.opencode/command/adv-cleanup.md`, `skills/adv-cleanup/SKILL.md`, `.adv/specs/worktree-lifecycle/spec.json`, and `docs/specs/worktree-lifecycle.md`.

## LBP Analysis

Structural boundedness belongs in the tool layer. Relying on the global MCP/tool timeout yields ambiguous failures after deletion and could cause unsafe retries. A typed bounded helper makes authority explicit: git removal decides delete success; workflow notification/cache freshness is warning-bearing. Keeping `/adv-cleanup` report-only preserves deletion ownership in `adv_worktree_delete` / `adv_worktree_cleanup`.

## Affected Components

- `plugin/src/tools/worktree/index.ts`
- `plugin/src/tools/worktree/index-delete.test.ts`
- `.opencode/command/adv-cleanup.md`
- `skills/adv-cleanup/SKILL.md`
- command/skill asset tests
- `.adv/specs/worktree-lifecycle/spec.json`
- `docs/specs/worktree-lifecycle.md`

## Risks / Mitigations

- **Timeout wrapper does not cancel underlying promise.** Mitigated by late-success reconciliation that clears queued records if the eventual result succeeds or the path disappears.
- **Multiple warnings may collide.** Combine warning strings deterministically without changing success/failure discriminants.
- **Cleanup timeout may hide a safety failure.** Retained count and attempt increment preserve the item for retry/inspection.
- **Overlap with `addTerminalCleanupReaper`.** This change only adds bounded primitives and report docs; broad reaper consolidation remains deferred.

## Validator Result

DESIGN_VALIDATION: `VALIDATED`.
