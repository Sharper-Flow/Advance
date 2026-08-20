## Root cause

`plugin/src/tools/archive-helpers/git-finalize.ts` commits the archive bundle at 3613, then captures `changeTipSha` at 3638. `verifyDirectMergedPrProof` requires `prHeadSha === localTip` at 1494, but `prHeadSha` is GitHub's `headRefOid` — the tip as merged. When the PR merged before archive ran, that is the pre-bundle tip, so the equality cannot hold.

Reproduced twice. Merge strategy is irrelevant: ancestry is checked at 1565 and would pass, but control flow returns at 1496 before reaching it.

The failing path (`finalizeRelease:3760`, `route === "direct"`) is a deliberate capability. Comment at 3755-3758: "A direct route may be resumed after the change branch was already squash-merged through GitHub."

## Scenario matrix

| | Ordering | `headRefOid` equals | Status |
|---|---|---|---|
| A | archive, then merge | post-bundle tip | works today; pinned by tests 3057/3205/3344 |
| B | merge, then archive | pre-bundle tip | **the defect** |
| C | PR open, archive pushes bundle, then merge | post-bundle tip | behaves as A |
| D | force-push/rebase between PR and archive | neither | correctly fails closed |

Validation confirmed `{pre, post}` is a complete candidate set for non-adversarial flows. D failing closed is correct posture, not a gap.

## Design (post-validation)

`changeTipSha` retains its post-bundle meaning. `historical-repair.ts` stays untouched — its `phase9_status` schema is `.passthrough()` (75-88), so a new field survives its reads.

1. **Capture `preArchiveTipSha`** via `rev-parse sourceBranch` before `commitArchiveArtifacts` (3613). Feasible: `sourceBranch` resolved at 3566, `validateChangeWorktree` at 3571 guarantees the workdir is on that branch.

2. **Merged-PR proof accepts either candidate.** `prHeadSha === changeTipSha || prHeadSha === preArchiveTipSha`.

   Validation confirmed this is not a weakening. The equality is one conjunct of eight (1482-1494) — MERGED state, `headRefName === change/{id}`, `baseRefName === defaultBranch`, non-cross-repo, exact head repo, non-empty `mergeCommitOid` — plus a post-hoc ancestry check at 1565. Both candidates are tips of the same branch one commit apart within a single invocation. An unrelated PR matching `preArchiveTipSha` would have to have head branch literally `change/{changeId}` at exactly our pre-bundle tip; if that merged, our content landed. Multiple exact matches already fail closed via `MERGED_PR_PROOF_AMBIGUOUS` (1528-1537).

   Degenerate case is benign: when `commitArchiveArtifacts` returns `{committed:false}` (3372-3374), pre and post are identical and the candidate set collapses to today's singleton.

3. **Tree re-proof — amended.** Trying the pre-bundle tree is retained, but it **must emit a distinct proof token** (e.g. `pr_merged_by_tree_pre_archive`) rather than collapsing into `pr_merged`.

   Rationale: active change `replaceReleaseEvidence` (RCA-2, QUAL-012, HIGH) already identifies `detectSquashMergeByTree` as too permissive and explicitly requires a distinct token if the heuristic is retained — "Collapsing both into `'pr_merged'` is the part that makes the heuristic unauditable." A second candidate tree takes 50 probes to 100. The false-positive *class* is unchanged (both trees differ only in `.adv/` artifacts), but the exposure doubles, and emitting an undifferentiated token would move directly against that change's approved direction.

4. **Threading — corrected and expanded.** The proposal listed four sites and was wrong on both counts.

   Mandatory, previously missed:
   - **`types/changes.ts:980-1012`** — `Phase9FinalizationStatusSchema`. Zod strips unknown keys on every round-trip, and the readback verify at `archive-gate.ts:610-615` checks only `status`. Without the schema field the value is dropped **silently and invisibly**. This is the same silent-failure class as the defect being fixed.
   - **`change/helpers.ts:304-328`** — archive_convergence path.

   Confirmed sites: `handlers-archive.ts:982-996`, `archive-gate.ts:593-607`, `buildPendingMergePhase9Status` (`archive-gate.ts:221-235`).

   `preservePhase9Evidence` (`archive-gate.ts:181-219`) enumerates fields explicitly and needs a clause, or the value is dropped whenever the next status omits it — for example the failed-status write at `handlers-archive.ts:765-775`.

   `GitFinalizeOutcome` must carry the field, and every return that sets `changeTipSha` must set it too: shipped (3787-3804), PR-route handoffs (3679, 3697).

   `signals.ts:732-735` picks it up automatically once the schema carries it.

5. **Duplicate bundle commits — amend rejected, root cause found.**

   The proposal's amend mechanism is wrong on three counts, all confirmed:
   - The branch is typically already pushed, so amend rewrites a public tip and requires force-push, which host policy prohibits outright.
   - Amending after a merge destroys the evidence: the post-amend tip matches neither captured SHA, breaking the very proof this change creates.
   - Skip-if-unchanged already exists at 3372-3374 and does not fire.

   Actual root cause: bundle regeneration embeds wall-clock timestamps on every run — `delta.ts:320` and `:377` set `spec.updated_at = new Date().toISOString()` on every successful apply; `archive.ts:520` sets `generated_at`; `archive.ts:884` and `:1341-1355` thread `archivedAt` into `writeArchiveBundleFiles`. Those files are in `commitPaths` (`archive.ts:1156`), so status is always dirty and a new commit always follows.

   The correct fix is deterministic regeneration — preserve prior timestamps when content is otherwise unchanged — after which the existing skip-if-unchanged guard handles retries naturally.

   **Scope decision required** (see below).

## Accepted consequence to document

In scenario B the shipped return (3787-3804) pushes nothing, so the default branch never receives the in-repo bundle. The store-side bundle is the durable artifact, and `historical-repair.ts:111-139` reads specs from the persisted post-bundle `changeTipSha`. Consistent, but it must be written down rather than discovered later.

## Sequencing — corrected

The discovery framing overstated this. Of the five branches rewriting `git-finalize.ts`, only `fixTaskUpdatePersistence` is an active ADV change (at release). `improveCrossProject`, `fixReleaseGateProjection`, `addDefaultSignalHandler` and `reconcileStoreMigrationResidue` have worktrees but **no active change** — orphaned drift, and `adv-cleanup` candidates.

Three of those are *older snapshots* that predate `verifyDirectMergedPrProof` entirely, so rebasing them inherits the trunk fix wholesale. The genuine risk is `improveCrossProject`, whose `git-finalize.ts` has no `verifyDirectMergedPrProof`, no `headRefOid`, no exact-SHA proof at all, and which deletes `historical-repair.ts`.

**Rewrite-resistance mechanism:** anchor the fix with a scenario-B regression test at `finalizeRelease` integration level (fixture style of `git-finalize.test.ts:3040-3069`) plus a handler-level assertion in `change.archive-phase9.test.ts`. Unit tests on `verifyDirectMergedPrProof` alone would be deleted along with the function during a rewrite; an integration test asserting "resume-after-merge ships with mergeCommitSha" forces any rewrite to keep the contract or consciously weaken it in review.

## Alternatives rejected

- **`merge-base --is-ancestor prHeadSha changeTipSha`** — one command, no threading, covers A/B/C, but strictly more permissive: it blesses a PR merged at any stale ancestor while the local tip advanced, marking unmerged work shipped. That is precisely the duplicate-merge case the comment at 3755-3758 guards against. Comparable complexity, worse safety.
- **Compare against persisted `phase9_status.prHeadSha`** — dead on arrival for first-run scenario B; `phase9_status` is constructed only after finalization (`handlers-archive.ts:806-815`), so nothing exists to compare against.

## Acceptance criteria

- AC1 — A change whose PR merged before archive completes `phase9:"run"` with a recorded `releasedCommitSha`, without falling back to `phase9:"skip"`.
- AC2 — Scenario-B regression test at `finalizeRelease` integration level, failing against current code.
- AC3 — Handler-level scenario-B assertion in `change.archive-phase9.test.ts`.
- AC4 — Squash-merged and merge-commit PRs both satisfy AC1.
- AC5 — Scenario A preserved: tests 3057/3205/3344 green and unmodified; `changeTipSha` keeps post-bundle meaning.
- AC6 — `preArchiveTipSha` persists across a round-trip, proven by readback rather than by write-site inspection.
- AC7 — `preservePhase9Evidence` carries the field forward when the next status omits it.
- AC8 — Pre-bundle tree match emits a distinct proof token, never bare `pr_merged`.
- AC9 — Scenario D (force-push/rebase divergence) still fails closed.
- AC10 — `historical-repair.ts` unmodified; existing archived records parse unchanged.
- AC11 — Full plugin unit suite green.
