# ADR 0010: Post-merge archive authority and worktree cleanup

- **Status:** Proposed (pending archive of `fixPostMergeArchiveCleanup`)
- **Date:** 2026-08-27
- **Associated change:** `fixPostMergeArchiveCleanup`
- **Supersedes:** none
- **Related:** ADR 0004 (per-epic workflow), `rq-archiveTerminalDurability01` (advance-workflow), `rq-terminalCleanupReaper01` (worktree-lifecycle), `rq-terminalCleanupSafety01` (worktree-lifecycle), `rq-worktreeDeletionProtocol01` (worktree-lifecycle)

## Context

Archive completion has two projections with different owners. The canonical external bundle owns post-merge release and Phase 9 facts. The tracked repository bundle and spec files provide the released projection. A replay that writes tracked files before it selects merged proof can create commits after the merged PR head. Git then refuses normal worktree deletion because local history is newer than the PR head.

Archive completion also needs one terminal path. Normal finalization and merged replay must share shipped completion. That path must preserve archived status when cleanup refuses. It must clean the exact worktree without deleting a local or remote PR branch automatically.

## Decision

### Canonical ownership and replay order

1. The archive command selects structural merged proof before it calls any tracked archive or spec writer.
2. After release integration, the tracked in-repository projection is frozen.
3. Post-merge release, Phase 9, and archived lifecycle facts update only the canonical external bundle.
4. Normal finalization and merged replay use one shipped-completion seam.
5. The seam runs exact-worktree cleanup once through `advWorktreeDelete`.
6. A safe cleanup refusal returns a typed retained disposition and does not undo archived status.
7. Automatic cleanup never deletes a local or remote PR branch. An operator uses the explicit `archived_branches` cleanup mode for branch cleanup.

### Historical recovery

Archive-owned historical recovery is an explicit signed-plan mode in the existing worktree deletion authority. The signed plan binds merge identity, PR head, local head, ancestry direction, changed paths, canonical hashes, terminal proof, cleanliness, CWD, lock, deadline, and expiry. Apply revalidates every bound fact under the repository cleanup lease before it can run `git worktree remove`.

The modes use different ancestry rules:

- Normal cleanup requires local HEAD to be integrated into the PR head.
- Archive-owned recovery requires the PR head to be an ancestor of local HEAD.

Recovery is valid only for a clean archived worktree when exact PR identity, terminal status, archive-owned path allowlists, canonical hashes, and the selected ancestry rule all verify. `force:true` cannot select recovery without the signed plan.

## Consequences

- The canonical external bundle remains the authority for post-merge terminal facts.
- The released tracked projection cannot gain post-merge commits from replay.
- Normal finalization and replay have one shipped completion and one cleanup call.
- Cleanup can retain a worktree without changing archived lifecycle state.
- Automatic cleanup removes only the exact worktree. Branch cleanup remains explicit.
- Historical divergence has a narrow, auditable recovery path with lease-time drift checks.
- Dirty, ambiguous, expired, locked, in-use, drifted, hash-mismatched, path-mismatched, or unproven state remains retained.

## Alternatives rejected

- **Reset or rebase the change branch:** rejected because it changes user history and hides the archive-owned cause of the divergence.
- **Force worktree deletion:** rejected because generic force bypasses proof and cannot distinguish safe historical divergence from unsafe state.
- **Write the default checkout after merge:** rejected because the default checkout is not the owning worktree and would create an unsafe cross-worktree mutation path.
- **Automatically delete PR branches:** rejected because branch removal has a separate operator approval boundary and is not required to clean the exact worktree.
- **Use separate completion paths for normal finalization and replay:** rejected because separate paths can disagree on terminal facts and repeat cleanup side effects.
