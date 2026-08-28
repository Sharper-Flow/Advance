## Cross-Project Origin

This change was created as a follow-up from **pokeedge-web**.

| Field | Value |
|-------|-------|
| Source project | pokeedge-web |
| Source path | `/home/jon/dev/pokeedge-web` |

> **Note:** The originating project should be consulted for context on why this change is needed.


# Proposal — Fix release validation failures

## Problem

Release `32ec6a59f0f57d72027d1b1646072e5422e15a71` shipped the archive cleanup correction, but post-release proof found three remaining failure classes:

1. The direct archive route refreshes tracked terminal-projection files after the release push. The worktree becomes dirty before cleanup, so the deletion planner correctly retains it.
2. The release introduced one unused exported type, `ArchiveCleanupDisposition`, which increased the dead-code ratchet from the 52 base findings to 53.
3. The base commit already failed CI for `nanoid@3.3.17` and 52 unreviewed dead-code fingerprints. The same OSV advisory and dead-code class remain on the release SHA.

The user selected full remediation: restore green release validation, fix the release-owned regressions, and preserve cleanup safety.

## Root Cause Analysis

### Observed behavior

- `adv_change_archive` shipped successfully by direct push and recorded all gates as done.
- Post-archive worktree triage found three modified files under the matching tracked archive bundle.
- CI failed the OSV dependency scan and dead-code ratchet.

### Causal path

1. Direct finalization pushes the archive commit to `origin/trunk`.
2. Release gate completion receives `inRepoBundlePath` and refreshes terminal projections after that push.
3. The shared deletion planner sees a dirty worktree and refuses deletion under `rq-terminalCleanupSafety01.5`.
4. The runtime loaded before this release omits the typed cleanup result, so post-release triage provides the retained-state evidence.
5. `ArchiveCleanupDisposition` is exported but used only inside `handlers-archive.ts`, so Knip reports one new unused export.
6. Base-SHA CI proves the nanoid advisory and 52 other dead-code findings existed before this release.

### Evidence

- Released SHA and durable release gate: `32ec6a59f0f57d72027d1b1646072e5422e15a71`.
- Dirty paths: `.adv/archive/2026-08-27-fixPostMergeArchiveCleanup/{BRIEFING_DIGEST.md,change.json,summary.v1.json}`.
- Current dead-code scan: 53 findings, including `ArchiveCleanupDisposition`.
- Base CI SHA `050a5aaf591fce49766d93e973c9213733712a22`: the same nanoid advisory and 52 dead-code findings.
- Current CI: https://github.com/Sharper-Flow/Advance/actions/runs/33120472180.

## Intent

Restore release validation to green without weakening worktree deletion rules or hiding dead code behind an unreviewed baseline update.

## Lowest-breaking-point targets

- Prevent direct-route terminal completion from rewriting the tracked bundle after release finalization.
- Keep canonical ADV storage authoritative for post-release facts.
- Remove the unnecessary exported type.
- Upgrade the vulnerable transitive dependency through the owning package lock.
- Review all dead-code findings. Remove true dead code and record only structurally required dynamic exports in the reviewed baseline.
- Clean the retained worktree only through approved worktree authority after its tracked state is safe.

## Scope

- Direct archive terminal-refresh ordering and route tests.
- `ArchiveCleanupDisposition` visibility.
- `plugin/pnpm-lock.yaml` nanoid resolution.
- Dead-code finding review, subtraction, and justified baseline maintenance.
- Release CI, deployment, and retained-worktree verification.

## User outcomes

- The release CI reaches terminal success.
- Direct archives do not create hidden tracked changes before cleanup.
- Cleanup remains fail-closed for ambiguous or user-owned work.
- The current retained worktree has an explicit safe disposition.
- The deployed plugin matches the released repair.

## Constraints

- Do not force-remove or manually delete a worktree.
- Do not weaken dirty-worktree, CWD, lock, deadline, ancestry, or lease checks.
- Do not approve dead-code fingerprints without reviewing their runtime ownership.
- Deploy only from merged `trunk`.
- Keep unrelated behavior unchanged.

## Spec-law impact

Existing archive and worktree laws already require typed retained cleanup, canonical terminal ownership, operator-explicit PR branch cleanup, and fail-closed dirty worktrees. Discovery must determine whether direct-route canonical-only completion needs a clarifying scenario. No spec change is presumed before that review.