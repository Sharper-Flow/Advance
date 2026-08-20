## Outcome

`adv_change_archive phase9:"run"` now completes for a change whose PR merged before archive ran. Previously it failed deterministically with `MERGED_PR_PROOF_MISMATCH`, forcing the operator to fall back to `phase9:"skip"` and record release evidence by hand — discarding the durable git-finalization record that rq-releaseFinalization01 exists to produce.

Found while archiving toolbox change `fixAdvStatusMarker`, whose PR #221 was genuinely merged with complete proof and was still refused twice.

## Root cause

`git-finalize.ts` commits the archive bundle at 3613, then captures `changeTipSha` at 3638. `verifyDirectMergedPrProof` requires `prHeadSha === localTip` at 1494, but `prHeadSha` is GitHub's `headRefOid` — the tip **as merged**. When the merge preceded archive, that is the pre-bundle tip, so the equality could never hold.

The failing path is a deliberate capability, not an accident. The comment at 3755-3758 states it: "A direct route may be resumed after the change branch was already squash-merged through GitHub."

## Two diagnoses were wrong before the right one

Recorded because the pattern matters more than the conclusion.

1. **"Squash merge destroys change-tip ancestry."** Wrong. Ancestry is checked at 1565 and would have passed — the merge commit is reachable. Control flow returns at 1496 first. A merge-commit PR fails identically. Merge strategy is irrelevant to this defect.
2. **"`detectSquashMergeByTree` needs the post-bundle tip, only the PR check needs pre-bundle."** Wrong. Both consumers want *the tip that was actually merged*, which is post-bundle when archive precedes merge and pre-bundle when merge precedes archive. The axis is ordering, not consumer identity.

Both were asserted with more confidence than the evidence supported, and both were caught before costing anything — the first by reading the code, the second by discovery.

## Scenario matrix

| | Ordering | `headRefOid` | Status |
|---|---|---|---|
| A | archive, then merge | post-bundle tip | worked before, preserved |
| B | merge, then archive | pre-bundle tip | the defect, now fixed |
| C | PR open, archive pushes bundle, then merge | post-bundle tip | behaves as A |
| D | force-push/rebase divergence | neither | fails closed, correctly |

## What shipped

- `preArchiveTipSha` captured before `commitArchiveArtifacts`; `changeTipSha` unchanged in meaning and position.
- `verifyDirectMergedPrProof` accepts either candidate. All seven other conjuncts and the ancestry check are intact, as is `MERGED_PR_PROOF_AMBIGUOUS`.
- `detectSquashMergeByTree` tries the pre-bundle tree under a **distinct** token, `pr_merged_by_tree_pre_archive`. The structural path never populates an API-confirmed `mergeCommitSha`.
- Threaded through the schema and eight sites.

## Decisions worth recording

**Accepting two candidate SHAs is not a weakening.** The equality is one conjunct of eight, both candidates are tips of the same branch one commit apart within a single invocation, and an impostor would need head branch literally `change/{id}` at exactly the pre-bundle tip — in which case the content did land. Multiple exact matches still fail closed.

**The distinct tree token is a cross-change constraint, not a preference.** Active change `replaceReleaseEvidence` (RCA-2, QUAL-012, HIGH) identifies this heuristic as unauditable precisely because it collapses inferred and API-confirmed merges into one token. Emitting bare `pr_merged` here would have moved against its approved direction. Probe surface honestly doubles from 50 to 100; the false-positive class is unchanged.

**Two simpler alternatives were rejected.** `merge-base --is-ancestor prHeadSha changeTipSha` is one command with no threading, but blesses a PR merged at any stale ancestor while the local tip advanced — the duplicate-merge case the code already guards. Comparing against persisted `phase9_status.prHeadSha` is dead on arrival: nothing exists to compare against on first run.

## Near-misses

- **The schema site.** The original threading map omitted `Phase9FinalizationStatusSchema`. Zod strips unknown keys on every round-trip and the readback verify checks only `status`, so writes would have appeared to succeed while the value vanished — the same silent-failure class as the defect itself. Acceptance now requires round-trip readback proof, not write-site inspection.
- **`gate.ts`.** Not in the planned site list. Its reachability calls pass `prHeadSha` and `changeTipSha` positionally, so omitting the new field would have fixed archive while leaving the release gate blind to scenario B.

## Deliberately not done

- **Bundle timestamp determinism** — split into `makeArchiveBundleDeterministic`. Retries stack duplicate archive commits because regeneration restamps `spec.updated_at`, `generated_at` and `archivedAt` every run, so the existing skip-if-unchanged guard never fires. The naive repair (amend) was rejected: the branch is normally pushed, so it needs a force-push, and amending post-merge destroys the proof this change creates.
- **`detectSquashMergeByTree` permissiveness** — owned by `replaceReleaseEvidence`.
- **Pre-existing trunk CI failures** — owned by `fixPreExistingTrunkCiFailures`. Verified unchanged: 20 dead-code fingerprints on both branch and trunk, and `pnpm-lock.yaml` untouched.

## Accepted consequence

In scenario B the shipped return pushes nothing, so the default branch never receives the in-repo bundle. The store-side bundle is the durable artifact, and `historical-repair.ts` reads specs from the persisted post-bundle `changeTipSha`. Consistent, but written down rather than left to be rediscovered.

## Open validation

Proven by unit and handler tests, not yet by a live archive. The real confirmation is the next change completing `phase9:"run"` instead of falling back to skip — which requires this merged and deployed.

Four orphaned worktrees surfaced during discovery (`improveCrossProject`, `fixReleaseGateProjection`, `addDefaultSignalHandler`, `reconcileStoreMigrationResidue`) have branches but no active change. They are `adv-cleanup` candidates.
