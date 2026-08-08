## Intent

`adv_change_archive` cannot exit a state it created. When a change carries `status: "archived"` with an archive bundle present in the **external store** but no committed **in-repo** projection, the archived-retry branch demands a `spec-projection.json` that was never committed, returns `MANIFEST_UNREADABLE`, and refuses. The reconcile path that would remedy it sits 60 lines below in the same function, unreachable.

Make an absent projection route to reconcile instead of refusal, without loosening any integrity check.

## Root Cause Analysis

### Observed failure

```
Archived retry projection proof failed: MANIFEST_UNREADABLE:
Released projection manifest is unreadable: fatal: path
'.adv/archive/2026-08-08-fixWorktreeDeletionReliability/spec-projection.json'
does not exist in 'e3ef531a0e3f1c9f605fe3885636cbf4ce75b652'
```

Reproduced against `fixWorktreeDeletionReliability` on 2026-08-08. Every archive route is refused; the change cannot reach a terminal state.

### Timeline evidence (verified)

| Time (UTC) | Event | Artifact |
|---|---|---|
| 2026-08-07 23:08 | PR #405 merged — ships the implementation | commit `e3ef531a` |
| 2026-08-08 01:29 | Archive writes bundle to external store incl. `spec-projection.json` | `~/.local/share/opencode-projects/…/archive/2026-08-08-fixWorktreeDeletionReliability/` |
| 2026-08-08 05:27 | `/adv-harden` records release gate, `releasedCommitSha=e3ef531a` | gate evidence |

The recorded release commit **predates the bundle by 2h21m**. The retry proof requires that bundle to exist inside that commit. Structurally impossible.

Independently verified: `git log --all -- '.adv/archive/*fixWorktreeDeletionReliability*'` returns empty. The in-repo bundle exists in **no commit on any branch**. The external-store bundle is complete and schema-valid.

### Mechanism

`plugin/src/tools/change/handlers-archive.ts:326`:

```ts
if (!dryRun && change.status === "archived" && existingBundlePath) {
```

`existingBundlePath` is derived from `findArchiveBundle(archivePaths.archive, changeId)` at line 278–280 — the **external store**. It is truthy.

The branch it guards then proves a property of a **different store**: whether the in-repo `.adv/archive/{bundle}/spec-projection.json` is committed at the released commit (`verifyProjectionAtGitCommit`, `plugin/src/archive/projection-proof.ts:333`). When that path is absent, `readGitPath` rejects, the catch at line 349-355 returns `MANIFEST_UNREADABLE`, and the caller returns a hard refusal at line 363-372.

**Root cause: external-store bundle presence is used as authority for in-repo projection durability.** One surface's state stands in for another surface's fact. The same defect class as `rq-archiveDeltaReconciliation01`'s stale-projection case, but with the projection never having existed rather than being stale.

### Contributing factor

`MANIFEST_UNREADABLE` conflates two conditions requiring opposite responses:

- **Absent** — the projection was never committed. Not a proof failure; unstarted work. Correct response is to commit it.
- **Invalid** — the manifest exists but is corrupt, unparseable, or schema-violating. A genuine integrity failure. Correct response is refusal.

Because both collapse to one code, the absent case inherits the invalid case's refusal.

### Why the remedy already exists

`handlers-archive.ts:386-422` handles exactly this shape:

```ts
if (existingBundlePath !== null) {
  reconciledInRepoPath = await reconcileInRepoArchive(...)      // stage bundle into worktree .adv/archive/
  archiveResult = await archiveChange({ ..., reuseExistingBundlePath: existingBundlePath })
}
```

It stages the intact external bundle in-repo, applies the deltas, regenerates docs. The retry branch intercepts before this is reachable.

### Falsifiable prediction

A change with `status: "archived"`, a valid external-store bundle, non-empty deltas, and no committed in-repo `spec-projection.json` will be refused today and will reconcile after the fix. Corrupt and mismatched manifests will continue to be refused in both cases.

## LBP Targets

1. **Placement of the absent/invalid distinction.** Typed error code in `projection-proof.ts` where the knowledge lives (P33 — structural over call-site heuristic), versus a boolean guard at the `handlers-archive.ts:326` call site. Chosen: typed split. Existence must be probed structurally (`git cat-file -e`), never by matching git stderr text.
2. **Idempotence of the fallthrough.** Falling through to line 386 re-runs Phase 9 on a change whose release gate is already `done`. This must be verified, not assumed — idempotence is the property that already failed here.
3. **Blast radius of `existingBundlePath` semantics.** Determine whether other reads in this file treat external-store presence as in-repo authority.

## Scope

- `plugin/src/archive/projection-proof.ts` — split `MANIFEST_UNREADABLE` into `MANIFEST_ABSENT` and `MANIFEST_INVALID`; structural existence probe before read
- `plugin/src/tools/change/handlers-archive.ts:326-384` — route `MANIFEST_ABSENT` to the reconcile path at 386; all other proof failures unchanged
- Tests — RED reproducing the refusal; GREEN proving reconcile routing; integrity refusals for corrupt/mismatched manifests must remain red

## Out of Scope

Layers 1 and 2 of the analysis, each warranting its own change:

- Giving projection proof its own commit anchor rather than inheriting `releasedCommitSha` from code-release proof. Merged-PR proof answers "is the code on the default branch"; projection proof asks "are the spec deltas on the default branch". These are different commits by construction.
- Gating release-gate recording on projection durability, so a release gate cannot assert "shipped" while the projection has never been committed.

## User Outcomes

- A change whose code shipped but whose archive bundle never landed can be archived, instead of being permanently unable to reach a terminal state.
- `fixWorktreeDeletionReliability` unblocks.
- Corrupt-manifest and mismatched-manifest refusals are unchanged. This loosens no integrity guarantee.
