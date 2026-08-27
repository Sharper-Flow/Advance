# Agreement — Fix post-merge archive cleanup

## Discovery summary

Discovery traced the defect through archive finalization, terminal projection refresh, worktree deletion planning, and archive output. The active and archived inventory covered all 220 Advance changes. `commitArchiveCompletion` was the only direct duplicate and is now superseded. `fixSquashMergeWorktreeCleanup` remains separate because it owns a different `git branch -d` squash-merge defect.

Source and prior-change evidence identified four established boundaries:

1. Canonical release and lifecycle state must be durable before cleanup.
2. `advWorktreeDelete` is the sole worktree deletion authority.
3. PR branch deletion remains operator-explicit through `adv_worktree_cleanup mode=archived_branches`.
4. Cleanup refusals must remain typed and fail closed for genuine user work.

The user selected canonical-store ownership for facts that exist only after merge. The user also selected automatic worktree cleanup with operator-explicit PR branch cleanup. The agreement adopts a terminal retained-cleanup result when safe deletion refuses the worktree. This keeps shipped truth accurate while preventing an unqualified cleanup-success claim.

## Confirmed causal path

1. `finalizeRelease` calls `commitArchiveArtifacts` before merged-PR replay detection.
2. A replay after merge can therefore create an archive-only local commit beyond the recorded PR head.
3. Terminal refresh rewrites tracked in-repository projection files after merge, when the merged PR provides no commit vehicle.
4. The worktree planner correctly rejects the resulting dirty files or local commits after the PR head.
5. `handlers-archive.ts` retains the typed worktree result but omits it from output.
6. The same handler discards the non-throwing `deleteChangeBranch` result and catches only exceptions that the helper does not use.
7. A successful release can therefore leave hidden retained cleanup state.

## Objectives

- **O1 — Prevent new replay divergence.** A merged-PR replay creates no local commit after the recorded PR head and performs no tracked in-repository terminal refresh on the change branch.
- **O2 — Keep terminal truth authoritative.** Facts that exist only after merge remain in the canonical ADV store and surviving authoritative archive bundle. The tracked pre-merge repository projection stays stable.
- **O3 — Clean proven-safe worktrees.** Archive uses the shared plan/apply deletion authority after terminal and merge proof. PR branch cleanup remains operator-explicit.
- **O4 — Recover poisoned worktrees safely.** Existing archive-only descendant commits and dirty archive projections can be classified only through exact terminal, PR, reachability, path, cleanliness, CWD, and drift proof.
- **O5 — Report every cleanup outcome.** Archive output exposes worktree and applicable branch cleanup results, including refusal codes, reasons, hints, and retained targets.
- **O6 — Preserve all route and retry invariants.** Direct, no-remote, pending-PR, merged-PR, dry-run, exact-replay, and already-absent behavior remains explicit and idempotent.

## Acceptance criteria

### AC1 — Merged-PR replay does not mutate the released branch

Given a change whose recorded PR is merged and whose merge commit is reachable from `origin/{default}`, a replay:

- creates zero commits after the recorded PR head,
- leaves tracked in-repository archive files byte-identical to the merged PR content,
- writes terminal-only merge facts to canonical ADV state,
- and performs no branch deletion in PR mode.

### AC2 — New PR archives leave no hidden managed-worktree state

After terminal merge proof and canonical readback, archive invokes the shared worktree deletion planner and executor for the exact managed worktree. The final archive result reports one of these explicit states:

- worktree deleted,
- worktree already absent,
- or worktree retained with a typed blocker.

No result can report cleanup complete while the worktree remains registered or present.

### AC3 — PR branch cleanup stays operator-explicit

A merged-PR archive never calls automatic PR branch deletion. The retained local branch remains discoverable by `adv_worktree_cleanup mode=archived_branches dryRun=true`, with squash-safe merge proof and the existing approval boundary.

Direct-archive branch cleanup remains in place and reports its typed result.

### AC4 — Existing poisoned worktrees require full structural proof

The recovery planner accepts archive-owned replay divergence only when all conditions hold:

1. The owning change is terminal and archived.
2. Phase 9 records a merged PR for the same repository, head branch, and base branch.
3. The recorded merge commit is reachable from `origin/{default}`.
4. Every commit difference after the recorded PR head changes only the matching archive projection paths.
5. Every dirty path is inside that same matching archive projection.
6. No untracked path, non-archive path, process CWD, lock, workspace-ownership uncertainty, deadline expiry, or plan drift exists.
7. The executor revalidates the same facts under the repository lock before deletion.

Any failed or ambiguous condition retains the worktree and returns the existing typed refusal class.

### AC5 — Cleanup refusal preserves shipped truth without a false success claim

When release and terminal proof succeed but cleanup refuses deletion:

- the change remains terminal and archived,
- the archive result marks cleanup as retained rather than complete,
- the payload includes the exact worktree path, branch, error code, reason, hint, and retry route,
- branch deletion does not run,
- and user-facing output does not claim leak-free completion.

### AC6 — Non-throwing cleanup results are consumed

The archive handler consumes and reports every `AdvWorktreeDeleteResult` state. It also consumes every `DeleteChangeBranchResult` state on routes where direct branch cleanup is allowed. Tests prove local-delete failure and remote-delete failure reach archive output without requiring an exception.

### AC7 — Dry-run includes cleanup preview

A dry-run performs zero deletion or projection mutation. It returns the worktree deletion plan or typed refusal and states that merged-PR branch deletion is operator-explicit.

### AC8 — Route matrix remains correct

Automated coverage proves these states:

- pending PR or armed auto-merge: no terminal cleanup,
- merged PR: canonical terminal update, worktree cleanup attempt, no automatic PR branch deletion,
- direct remote: terminal proof, worktree cleanup, then typed direct-branch cleanup,
- no remote: local cleanup only,
- missing worktree: typed already-absent or not-found result without silent branch-policy drift,
- archive-delta repair: repair branch preservation remains unchanged.

### AC9 — Replay and retry are idempotent

An exact terminal replay adds zero repository commits, produces zero tracked worktree changes, repeats no successful destructive action, and adds no canonical projection revision. Repeated worktree deletion reports already absent through the existing typed contract.

### AC10 — Safety regressions fail closed

Negative tests prove that each condition prevents deletion:

- one changed path outside the matching archive projection,
- one untracked file,
- PR repository, head, or base mismatch,
- unreachable merge commit,
- nonterminal owner,
- live process CWD,
- lock or ownership uncertainty,
- expired plan,
- or any executor revalidation drift.

### AC11 — Specs state the ownership boundary

The shipped spec projection distinguishes the canonical terminal bundle from the tracked pre-merge repository projection. It also records the archive-owned recovery proof and the operator-explicit PR branch boundary. Schema, mirror, and requirement tests pass.

## Constraints

- **C1:** `advWorktreeDelete` remains the sole worktree deletion authority.
- **C2:** Preserve dirty, integration, process-CWD, lock, deadline, approval, and drift checks.
- **C3:** Canonical ADV state owns facts that exist only after merge.
- **C4:** The tracked in-repository archive projection must not change after its PR merges.
- **C5:** PR branch deletion remains operator-explicit.
- **C6:** Recovery proof uses typed Git and ADV evidence. Commit messages, path names alone, or heuristics never authorize deletion.
- **C7:** Archive output remains typed, bounded, and secret-safe.
- **C8:** Existing poisoned worktrees remain retained until the new planner proves them safe.
- **C9:** No background sweep, daemon, or session-start deletion is added.
- **C10:** Direct-archive cleanup preserves `rq-archiveBranchCleanup01.5`.

## Avoidances

- **DONT1:** Do not add a post-merge metadata commit on the change branch.
- **DONT2:** Do not create a follow-up default-branch commit or PR only to refresh terminal archive mirrors.
- **DONT3:** Do not force-remove, reset, checkout, or filesystem-delete a worktree outside the shared planner and executor.
- **DONT4:** Do not weaken general cleanup guards for an archive-specific incident.
- **DONT5:** Do not treat an archive path prefix or commit message as sufficient proof.
- **DONT6:** Do not suppress a typed cleanup refusal behind an exception-only catch.
- **DONT7:** Do not conflate this change with the separate squash-merge branch-delete repair.
- **DONT8:** Do not rewrite historical `archived_at` values or unrelated archive sidecars.

## Scope

### In scope

- Merged-PR replay ordering.
- Canonical versus in-repository archive projection ownership.
- Targeted worktree cleanup and proof-bound recovery.
- Archive cleanup result schemas and user-facing output.
- Dry-run cleanup previews.
- Route, retry, and poisoned-worktree regression coverage.
- Spec changes for archive and worktree lifecycle laws.

### Out of scope

- The `git branch -d` squash-merge defect in `fixSquashMergeWorktreeCleanup`.
- Automatic PR branch deletion.
- Product changes in pokeedge-web.
- General worktree planner redesign.
- Manual cleanup of unrelated retained worktrees.

## Lowest-breaking-point assessment

| Defect | Lowest owner | Required correction |
|---|---|---|
| Replay creates a post-PR commit | merged-PR detection versus `commitArchiveArtifacts` ordering | Detect terminal merged replay before any repository commit path. |
| Terminal refresh dirties tracked files | canonical/in-repository projection refresh boundary | Refresh canonical terminal state without rewriting the merged change branch. |
| Poisoned historical worktrees cannot delete | shared worktree planner and executor | Add a strict archive-owned divergence proof, then reuse existing plan/apply authority. |
| Cleanup refusals disappear | archive handler result assembly | Include typed worktree and direct-branch results in output. |
| Dry-run hides cleanup state | archive dry-run route | Invoke read-only planning and expose the preview. |

## Spec delta plan

- Amend `rq-archiveTerminalDurability01.1` to identify the canonical surviving bundle as terminal authority and prohibit post-merge tracked projection refresh on the change branch.
- Extend `rq-terminalCleanupSafety01` with proof requirements for archive-owned replay divergence.
- Clarify `rq-archiveBranchCleanup01` so merged-PR worktree cleanup and operator-explicit branch cleanup remain separate.
- Add a requirement for typed archive cleanup outcomes and dry-run preview if no current requirement expresses both behaviors.

## Prior decisions retained

- `fixArchiveTerminalDurability`: durable terminal proof precedes success and cleanup.
- `fixArchiveCleanupSequencing`: worktree removal precedes any allowed branch deletion.
- `fixArchiveBundleReStamping`: one canonical projection writer and stable `archived_at`; this change narrows the post-merge in-repository refresh.
- `fixWorktreeDeletionReliability`: Git census, typed plan/apply, lock-bound revalidation, and no manual fallback.

## Research evidence

- Local route and caller scan: `plugin/src/tools/change/handlers-archive.ts`, `plugin/src/tools/change/archive-gate.ts`, `plugin/src/archive/archive.ts`, `plugin/src/tools/archive-helpers/git-finalize.ts`, and `plugin/src/tools/worktree/**`.
- Official GitHub merge documentation confirms squash merge creates a new base commit and does not make the PR head an ancestor.
- Official Git documentation confirms `git branch -d` uses merged ancestry and `merge-base --is-ancestor` proves ancestry only.
- GitHub PR and CLI surfaces expose head OID, merge commit, state, base, and auto-merge evidence needed for structural proof.
- Architecture dependency check degraded because `depcruise` is not installed in the checkout. Source-level architecture review found no new dependency boundary requirement.
- Episode recall and lgrep were unavailable on the current tool surface. Discovery continued with source reads, official documentation, and independent research.

## Discovery disposition

- Opportunity scout reporting and dry-run candidates were adopted.
- Path-bounded poisoned-worktree recovery and projection ownership were carried into design constraints.
- Automatic branch cleanup without `worktreePath` was rejected because it would cross the operator-explicit PR branch boundary.
- The opportunity scout completed its research but could not persist its change-level report because the deployed report schema requires a task-scoped reviewer shape. The first independent researcher report persisted successfully.