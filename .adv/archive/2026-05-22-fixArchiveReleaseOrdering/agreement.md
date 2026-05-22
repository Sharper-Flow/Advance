# Agreement

## Objectives

1. Make the archive/sign-off path end in one consistent state: `status: archived` and release gate done.
2. Preserve Phase 9 structural safety: change branch reachable from default branch, default branch push verified when required, and evidence available before release completion is recorded.
3. Make retries idempotent when archive status or bundle already exists but release metadata is stale.
4. Prevent archive cleanup from deleting/invalidation the only context needed to finish release metadata.
5. Add terminal-neutral post-archive wayfinding that tells agents to continue from the main/default-branch checkout after worktree cleanup; mention Warp only as optional UX, not as a correctness dependency.

## Acceptance Criteria

1. `adv_change_archive phase9:"run"` completes an auto-managed change with both `change.status === "archived"` and `gates.release.status === "done"`.
2. Release completion is recorded only after Phase 9 reachability/push evidence exists; missing merge or missing push still blocks.
3. Retrying archive after a completed workflow or already-written archive bundle can reconcile stale release metadata without manual worktree recreation.
4. Worktree cleanup happens only after durable release/archive state is recorded, or cleanup is delayed/queued when needed to preserve recovery context.
5. Archive terminal report or command guidance includes a clear “continue from main/default-branch checkout” instruction after successful cleanup; no hard Warp API dependency.
6. Healthy archive paths remain idempotent and do not double-merge, double-push, or weaken linked-issue closure safeguards.
7. Targeted regression tests, `pnpm run check`, `pnpm run build`, and full `pnpm test` pass.

## Constraints

- Do not mark release complete without structural Phase 9 evidence.
- Do not use direct ADV state-file edits or Temporal DB surgery.
- Preserve signal/query-only change workflow architecture; no `defineUpdate` reintroduction.
- Keep task-completion semantics out of scope because another agent owns `fixTaskCompletion` / `fixCompletionSemantics`.
- Do not couple correctness to Warp or any terminal-specific navigation feature.

## Out of Scope

- Broad archive workflow rewrite.
- Warp endpoint smoke failures unrelated to post-archive wayfinding.
- New release modes beyond existing direct/PR archive modes.

## Sign-Off

User approved via chat: `approve`.