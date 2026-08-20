`adv_change_archive phase9:"run"` fails reproducibly with `MERGED_PR_PROOF_MISMATCH` (rq-releaseFinalization01) for any change whose PR was merged before archive runs.

Observed 2026-08-20 archiving toolbox change `fixAdvStatusMarker`. PR #221 was genuinely merged with complete proof — `state=MERGED`, `headRefOid` exactly equal to the change tip, `baseRefName=master`, merge commit reachable on `origin/master`, tree byte-identical. Archive still refused, twice.

Consequence: the merge-then-archive sequence cannot complete Phase 9 finalization. The operator must fall back to `phase9:"skip"` and record release evidence by hand, which discards the durable git-finalization record that rq-releaseFinalization01 exists to produce.
</problemStatement>
<parameter name="proposal">## Root Cause Analysis

### The defect is an ordering/contract collision, not a merge-strategy problem

`plugin/src/tools/archive-helpers/git-finalize.ts`:

```
3613:  const commitResult = commitArchiveArtifacts(...)   // bundle commit lands here
...
3636:  let changeTipSha: string | undefined;
3638:    changeTipSha = runGitOrThrow(repoRoot, ["rev-parse", sourceBranch], ...)
```

`changeTipSha` is captured **after** the archive bundle is committed to the change branch. That commit advances the branch tip.

`verifyDirectMergedPrProof` then consumes the same field as the merged-PR head comparison:

```
1435:  const localTip = input.changeTipSha?.trim();
...
1493:      localTip !== undefined &&
1494:      prHeadSha === localTip;
```

`prHeadSha` is the PR's `headRefOid`, which is by definition the tip **as it existed when the PR was merged** — before the bundle commit. `localTip` is the tip **after** the bundle commit. The two can never be equal on this path.

Failure is deterministic, not racy. Every `phase9:"run"` attempt commits another bundle commit and then fails the same comparison. Confirmed empirically: two `phase9:"run"` attempts against `fixAdvStatusMarker` produced exactly two `Archive fixAdvStatusMarker: apply spec deltas and bundle` commits (`49c7fbb`, `b6d1e4e`), and the branch tip diverged from PR #221's `headRefOid` (`2468fc16…`) at the first one.

### One field, two incompatible contracts

The capture site is not accidental. The comment at 3633-3635 states the intent:

> Capture the change-tip SHA after committing archive artifacts but before any finalization path can merge, delete, or move the branch. Tree-SHA re-proof must compare the exact branch content that Phase 9 releases.

That reasoning is **correct for `detectSquashMergeByTree`**, which must hash the content actually being released, i.e. post-bundle.

It is **wrong for `verifyDirectMergedPrProof`**, which compares against a GitHub-recorded head SHA that is necessarily pre-bundle.

`changeTipSha` therefore serves two consumers with contradictory requirements. Satisfying the tree-re-proof consumer structurally breaks the merged-PR consumer. This is the root cause; the merge strategy is irrelevant to it.

### Merge strategy is a red herring

An initial diagnosis blamed squash merge for destroying change-tip ancestry. That diagnosis is wrong and is recorded here so it is not repeated.

Ancestry is checked at line 1565 (`merge-base --is-ancestor mergeCommitOid origin/{default}`) and would have **passed** — the merge commit is reachable. Control flow never reaches it, because `exactRecord` already failed at 1494 and returned at 1496-1505. A merge-commit PR fails at exactly the same line for exactly the same reason: the bundle commit advances the tip regardless of how the PR was merged.

### Blast radius

Any repository where the PR merges before `adv_change_archive` runs. That includes every repo following a merge-then-archive operator flow, and every repo whose policy mandates PR-based merges.

## Relationship to existing Advance changes

Neither of these covers this defect; both touch the same subsystem, so sequencing matters.

- **`replaceReleaseEvidence`** (RCA-2) targets `detectSquashMergeByTree` being *too permissive* — a tree-SHA collision emitting `proof: 'pr_merged'` without correlation. That is a false-positive concern at the same boundary. This change is the mirror image: a false negative in `verifyDirectMergedPrProof`. Fixing one does not fix the other, but both edit the same file and the same proof path, so whichever lands second must rebase carefully.
- **`addMergeTriggeredArchive`** targets the session-bound archive *exit* — merged PRs stranding in-flight, sweep/reaper surfaces. It assumes archive finalization works once triggered. This defect means it does not, on the PR path. This change is a prerequisite for that one delivering value.

Recommend landing this first: it is narrow, and it unblocks the operator flow both siblings assume.

## Proposed direction

Separate the two contracts. Capture the pre-bundle tip before `commitArchiveArtifacts`, and have `verifyDirectMergedPrProof` compare against that, while `detectSquashMergeByTree` keeps using the post-bundle tip it correctly requires.

Design gate should settle:

1. Whether the merged-PR comparison accepts pre-bundle tip only, or either tip (accepting both weakens the exactness guarantee and needs justification).
2. Whether `Phase9FinalizationStatusSchema` should persist both SHAs — `plugin/src/types/changes.ts:1002` currently persists one, constrained to 40-hex, and `historical-repair.ts:117-120` reads it.
3. Whether existing archived changes carrying a post-bundle `changeTipSha` need a legacy read path, or whether the field's meaning can be narrowed in place.

## Out of scope

- `detectSquashMergeByTree` permissiveness — owned by `replaceReleaseEvidence`.
- Sweep, reaper, and merge-triggered reconciliation — owned by `addMergeTriggeredArchive`.
- The pre-existing trunk CI failures (dead-code ratchet, `nanoid` OSV) — owned by `fixPreExistingTrunkCiFailures`.

## Acceptance criteria

- AC1 — A change whose PR merged before archive completes `phase9:"run"` with `proof: 'pr_merged'` and a recorded `releasedCommitSha`, without operator fallback to `phase9:"skip"`.
- AC2 — Regression test reproducing the exact failure: bundle commit advances the tip, PR `headRefOid` equals the pre-bundle tip, proof succeeds. Test must fail against current code.
- AC3 — Squash-merged and merge-commit PRs both satisfy AC1; the fix is merge-strategy agnostic and a test asserts both.
- AC4 — `detectSquashMergeByTree` continues to receive the post-bundle tip; its existing tests stay green and unmodified.
- AC5 — Repeated `phase9:"run"` attempts do not accumulate duplicate archive-bundle commits.
- AC6 — Existing archived changes with a persisted post-bundle `changeTipSha` remain readable; `historical-repair.ts` behaviour is unchanged or explicitly migrated.
- AC7 — Full plugin unit suite green.
</parameter>
</invoke>
