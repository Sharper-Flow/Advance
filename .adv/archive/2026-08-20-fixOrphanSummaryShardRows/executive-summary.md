## Outcome

`adv status --json` no longer reports dead records as active work. Measured against the store that exhibited the defect, the active count went from 10 to 6, and the four dead records now surface as reported residue instead of rendering as pickable work.

## What was wrong

A summary shard is a projection written from a canonical change record at commit time. Two readers treated it as authority instead: they enumerated `summaries/<id>/`, trusted each shard's self-reported status, and never asked whether the canonical record still existed, still parsed, or had since gone terminal. Nothing retracts a shard when its canonical record is quarantined, purged, left unmigrated, or corrupted, so a dead change kept reporting itself active indefinitely. The oldest was three weeks old.

The launcher was never the defect. It rendered its source faithfully; the source lied.

## What changed

`classifySummaryCandidates` wraps the existing `loadChange` and returns a four-way verdict: valid, `canonical_missing`, `canonical_terminal`, or `canonical_error` with the failure type. It runs after the terminal-status filter, so it validates roughly ten survivors rather than all 117 shards, preserving the no-hydration performance property the shard cache exists for.

Both read sites now use it — the CLI path in `loadSummariesFromDisk` and the launcher-projection path in `buildLauncherProjection`. There is exactly one implementation. The CLI reaches it through a generated `dist` bundle, matching how `reconcile` and `doctor` already cross that boundary, because `bin/lib/` may not import plugin storage even transitively.

Exclusions are reported on the payload, never silently dropped. One of the four ghosts is a genuine change whose record is corrupt; discarding it quietly would have destroyed the only signal that it needs repair.

## Decisions worth remembering

Two design claims were wrong and were caught by independent validation before implementation. Re-exporting the classifier through the CLI projection boundary would have failed a transitive import-graph guard. Modifying `listSummaryChanges` in place would have broken its documented no-hydration contract and the test that deliberately seeds shards with no canonical records. Both were corrected: bundle instead of re-export, compose at the caller instead of editing the lister.

Validation also found a case the original design missed — a change validly terminal in canonical while its shard still reads draft passes every filter, old and new. Classification widened from three-way to four-way to catch it. The record is already parsed at that point, so the check costs nothing.

Degraded mode reports rather than substitutes. If the bundle is unavailable, status emits rows with `validation_unavailable` instead of exiting or quietly trusting shards. Adding a fallback validator would have recreated the duplicate-authority problem the single classifier exists to prevent.

## What this exposed

Residue reporting surfaced 22 orphan shards in one store, not the 4 under investigation. The additional 18 are archived changes whose shards were never retracted, previously masked by a late archive scan. Active counts were never wrong because of them, but nothing removes them from disk. This turns the write-time-retraction follow-up from a theoretical concern into a measured one.

## Known limits

Those 18 report `canonical_missing`, which is accurate but does not distinguish normal archival from a vanished record.

Read-time validation makes orphans harmless; it does not stop them being created, and it does not bound disk growth. Two follow-ups remain named and unstarted: write-time shard retraction in quarantine and archive-purge, and a reconcile residue class with a `summariesDir` enumerator, since the residue scanner currently iterates the changes directory and structurally cannot see orphan shards.

The launcher-render confirmation is deferred to post-merge, because the launcher reads deployed artifacts and deploy runs only from a merged default branch.

A prompt-budget failure in `pnpm run check` predates this branch. It was reproduced byte-identically on clean trunk and left untouched; `fixPreExistingTrunkCiFailures` owns it.
