## Cross-Project Origin

This change was created as a follow-up from **pokeedge**.

| Field | Value |
|-------|-------|
| Source project | pokeedge |
| Source path | `/home/jon/dev/pokeedge` |

> **Note:** The originating project should be consulted for context on why this change is needed.


## Root Cause Analysis

Two independent defects in `plugin/src/archive/archive.ts` make an archive bundle non-deterministic across re-runs. Both were observed producing corrupted output, not merely inferred from reading.

### Defect 1 — `archivedAt` is re-derived on every run

`archiveChangeUnderLock` computes the timestamp unconditionally at function entry:

```ts
const targetArchivePath =
  context.reuseExistingBundlePath ?? archiveBundlePath(paths.archive, change.id);
const archivedAt = new Date().toISOString();   // :884
```

The line directly above already knows the run may be re-archiving an existing bundle — it reuses the *path*. The next line re-dates the *content* regardless. That value then flows into the spec projection (`:932`, `:937`), the external bundle (`:1132`), and the in-repo bundle (`:1153`), and every derived hash is recomputed against it.

The correct shape already exists 660 lines earlier in the same file. `refreshArchiveBundleProjectionUnderLock` (`:219-239`) reads the authoritative value back out of the persisted terminal summary when the caller supplies none:

```ts
let archivedAt = input.archivedAt;
if (!archivedAt) {
  ...
  archivedAt = summary.archived_at;
}
```

PR #428 removed the `new Date()` default from `createInRepoArchive` and made `archivedAt` a required parameter, which forced all 16 call sites to pass a value explicitly. That was the right structural move, but it only relocated the problem: the main archive path still manufactures a fresh value to hand in.

**Observed:** during the 2026-08-22 phase-9 repair sweep, `fixSetReconciliationPptNullKey` re-stamped `01:48:03 → 04:27:08` and was discarded with `git checkout -- .adv/`. The same mechanism had previously re-dated seven bundles from `2026-08-18T17:57:53` to `2026-08-21T23:21:05`.

### Defect 2 — the in-repo bundle is written before phase-9 finalization

`archiveChangeUnderLock` writes the in-repo bundle at `:1145-1163` and then returns. The phase-9 finalization commit happens afterwards, in the caller. The bundle therefore captures whatever the pre-finalization state was and can never record the terminal one.

This is an ordering defect, not a race — there is no interleaving under which the bundle sees `phase9_status: done`, because the write strictly precedes the transition.

`addMergeTriggeredArchive` documents a sibling of this defect on a different field: `pokeedge::unifyPricingSourcePrecedence` archived with `gates.release.status=pending` despite canonical shipped proof.

## What Changes

- Resolve `archivedAt` from the persisted terminal summary when an existing bundle is present, falling back to the clock only when genuinely archiving for the first time. Reuse the `refreshArchiveBundleProjectionUnderLock` read rather than adding a second implementation.
- Make the in-repo bundle observe the terminal state — either by writing it after finalization, or by refreshing it in the same path that records phase-9 completion.

## User Outcomes

- [ ] Re-running archive on an already-archived change leaves the bundle byte-identical
- [ ] An archived bundle records the terminal phase-9 status rather than `pending_merge`
- [ ] `.adv/archive/**` stops showing spurious git drift after routine repair runs

## Constraints

- `.adv/archive/**` is a tracked historical record. The fix must not rewrite existing `archived_at` values in either direction.
- Do not revive retired `adv_archive_repair` tooling or use direct state edits.

## Validation Plan

- Red first: a test that archives, re-archives, and asserts the bundle is unchanged — this must fail against current `:884`.
- Red first: a test asserting the in-repo bundle carries terminal phase-9 status.
- Then implement, and confirm both go green without weakening existing assertions.
