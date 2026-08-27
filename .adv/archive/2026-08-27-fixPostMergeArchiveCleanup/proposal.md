# Proposal: Fix Post-Merge Archive Cleanup

## Intent

Make one `adv_change_archive` replay complete all canonical post-merge facts and safely clean the exact change worktree without manual repair.

## Root Cause Analysis

1. `adv_change_archive` writes the external and tracked archive projections before PR merge proof exists.
2. The first PR-mode invocation returns `phase9: pending_merge`, so final release and Phase 9 facts do not exist yet.
3. After merge, the original tracked change branch can contain commits absent from the PR head because archive metadata existed only after the PR head.
4. `adv_worktree_delete` correctly interprets that topology as `local_commits_after_pr_head` and refuses deletion.
5. Current replay routes can complete canonical release state, but ownership is split across active-state and archived-bundle paths.
6. The replay order can still enter archive writers before detecting that merge already completed.

The defect is an ordering and ownership mismatch. Safety checks expose the mismatch. They do not cause it.

## Scope

### In Scope

- Add a post-merge archive replay preflight before any tracked archive or spec writer.
- Make canonical external archive state authoritative for post-merge release and Phase 9 facts.
- Freeze the tracked in-repository projection after release integration.
- Route normal release and replay through one shipped-completion function.
- Run automatic worktree cleanup after shipped proof.
- Add an archive-owned, proof-bound historical divergence mode to the existing deletion planner and executor.
- Return bounded retained-cleanup results when safe deletion cannot run.
- Preserve explicit PR branch cleanup through `adv_worktree_cleanup mode=archived_branches`.

### Out of Scope

- Automatic post-merge local branch deletion.
- Default-checkout writes after merge.
- Force-push, reset, rebase, cherry-pick, or manual filesystem deletion recovery.
- Weakening dirty-work, integration, lock, CWD, deadline, approval, or drift checks.
- Generic force semantics that bypass deletion proof.
- Cross-repository synchronization behavior.
- Deployment runner or reflection behavior.

## Success Criteria

1. Given a pending archive PR is merged, when the same archive command runs again, canonical release and Phase 9 state complete without writing tracked archive or spec files.
2. Given successful shipped proof, automatic cleanup invokes the existing deletion authority for the exact change worktree.
3. Given a proven clean historical divergence caused only by archive-owned paths, cleanup removes the worktree after planner and executor proof.
4. Given dirty, ambiguous, expired, drifted, locked, in-use, or unproven state, cleanup refuses safely and reports a bounded retained result.
5. Given the same command runs after terminal completion, the replay is a no-op and does not repeat finalization, issue closure, cleanup, or tracked writes.
6. Given direct archive routes, repair routes, zero-delta routes, or unsafe PR states, existing behavior remains unchanged.

## Constraints

- Preserve `advWorktreeDelete` as the sole deletion authority.
- Preserve the existing signed plan-token and revalidation model.
- Use structural PR evidence, canonical hashes, and exact path allowlists.
- Preserve canonical timestamps on replay.
- Do not read or write ADV state files directly.
- Do not delete PR branches automatically.
- Keep the architecture acyclic.

## Draft Spec Delta Shapes

### Modify `advance-workflow` requirement `rq-archiveTerminalDurability01`

Amend the requirement body to state that a verified merged replay must detect shipped evidence before tracked archive/spec writers. Post-merge facts update only the canonical external bundle. The tracked in-repository projection stays immutable after release integration.

Add scenario `rq-archiveTerminalDurability01.7`:

- Given a pending archive PR is structurally proven merged, the tracked in-repository bundle is reachable from the released commit, and the canonical bundle lacks final release facts.
- When the same archive command replays.
- Then replay detects merged proof before `archiveChange` or `reconcileInRepoArchive` can write.
- Then replay records release, Phase 9, and archived lifecycle facts only in the canonical external bundle.
- Then replay preserves the tracked bundle and all spec files byte-for-byte.

Add scenario `rq-archiveTerminalDurability01.8`:

- Given normal finalization ships or merged replay completes canonical terminal refresh.
- When the shared shipped-completion seam runs.
- Then worktree cleanup runs once through `advWorktreeDelete`.
- Then a safe refusal returns a typed retained-cleanup disposition without undoing archived status.
- Then exact replay is a no-op that does not repeat finalization, issue closure, cleanup, or tracked writers.

### Modify `worktree-lifecycle` requirement `rq-terminalCleanupReaper01`

Amend the requirement body to state that a shipped archive automatically invokes the shared terminal cleanup reaper for the exact change worktree. Cleanup refusal must remain non-destructive and must not activate PR branch deletion.

Add scenario `rq-terminalCleanupReaper01.3`:

- Given archive finalization has verified shipped proof for the exact change and worktree.
- When archive completion runs.
- Then the shared reaper delegates cleanup to `advWorktreeDelete`.
- Then a safe refusal records a typed retained disposition while the change remains archived.
- Then no automatic local or remote PR branch deletion runs.

### Modify `worktree-lifecycle` requirement `rq-terminalCleanupSafety01`

Amend the requirement body to permit archive-owned historical recovery only when exact PR identity, terminal status, path allowlists, canonical hashes, and mode-specific ancestry all verify. Generic force must not activate this mode.

Add scenario `rq-terminalCleanupSafety01.4`:

- Given a clean archived worktree has local commits after the merged PR head.
- Given every changed path after the PR head is archive-owned and matches canonical bundle bytes.
- When archive-owned recovery planning runs.
- Then PR-mode proof requires the PR head to be an ancestor of local HEAD.
- Then normal cleanup continues to require local HEAD to be integrated into the PR head.
- Then the signed plan binds the exact recovery proof and the executor revalidates it under the cleanup lease.

Add scenario `rq-terminalCleanupSafety01.5`:

- Given dirty, ambiguous, expired, drifted, locked, in-use, hash-mismatched, path-mismatched, or unproven state.
- When automatic archive cleanup runs.
- Then deletion refuses without filesystem removal or branch deletion.
- Then the returned disposition identifies the retained blocker with bounded evidence.

### Modify `worktree-lifecycle` requirement `rq-worktreeDeletionProtocol01`

Amend the requirement body to state that archive-owned historical recovery is an explicit signed-plan mode. The plan token must bind merge identity, PR head, local head, ancestry direction, changed paths, canonical hashes, and terminal proof. Apply must revalidate every bound fact.

Add scenario `rq-worktreeDeletionProtocol01.5`:

- Given a valid archive-owned historical recovery plan.
- When apply runs under the repository cleanup lease.
- Then apply revalidates every bound merge, ancestry, path, hash, cleanliness, CWD, lock, deadline, and terminal fact.
- Then any mismatch returns a typed refusal or drift result before `git worktree remove`.
- Then `force:true` without the signed recovery plan cannot select this mode.

## Approved Workaround

The active ADV runtime exposes no public spec-delta mutation surface. The user approved direct edits to the two typed spec files and their documentation mirrors in the isolated change worktree.

This exception is bounded:

- Apply only the requirement and scenario amendments listed above.
- Keep ADV external state untouched.
- Validate the typed specs and mirrors before completion.
- Commit the spec changes with the implementation before archive.
- Do not generalize this exception to other changes.

## Coordinated With

- `fixSquashMergeWorktreeCleanup` owns unrelated archive and branch cleanup behavior. This change preserves that boundary.
- `fixDeadInternalCallGuards` has a separate dirty worktree on `plugin/src/internal-call-routing.ts`, `plugin/src/tools/change/handlers-archive.ts`, and `plugin/src/tools/change/index.ts`. Implementation sequencing must avoid conflicting edits.
