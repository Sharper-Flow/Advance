# Design — Lifecycle-aware archived release repair

## Architecture

Release completion writes through one of two structurally selected legs:

```text
verified Git finalization.status=shipped
  ├─ active projection exists
  │    → existing coordinateChangeMutation gate path
  │    → synchronize existing archive bundle before active removal
  └─ active projection absent + validated existingBundlePath
       → withArchiveProjectionLock(project root)
       → commitChangeProjection(dirname(bundle), basename(bundle))
       → one mutation sets release gate + phase9 done
       → afterCommit regenerates projection-derived bundle files
```

## Decisions

### D1 — Lifecycle location selects mutation authority

Keep the active path unchanged when `store.paths.changes/<changeId>` exists. When it is absent and a validated existing bundle is supplied, target that bundle’s dated directory through `commitChangeProjection`; do not rehydrate active state.

### D2 — One recovery transaction owns release and Phase 9 state

The archive leg commits `gates.release` and `phase9_status=done` together with stable recovery operation identity derived from change ID and released commit SHA. `reconcileArchivedBundleRetry` must not call active-only `recordPhase9Status` after an archive recovery mutation.

### D3 — Derived files regenerate inside the committed transaction boundary

Expose a narrow archive-module helper backed by the existing `writeArchiveBundleFiles` implementation. Invoke it from `commitChangeProjection.afterCommit` while locks remain held. Recompute terminal `change_hash`, archive summary, and briefing digest from readback. Leave existing spec projection, narratives, wisdom, and multi-repo sidecars intact unless their canonical projection content is present.

### D4 — Preserve original archive time

Read and validate the existing terminal summary before mutation and reuse `archived_at` during regeneration. A retry must not make the archive appear newly created or produce timestamp-only drift.

### D5 — Normal path synchronizes before retirement

After active release-gate completion succeeds, write the same release-done readback to the just-created bundle before `removeChangeDir`. This closes the first-run gap; the archive leg remains recovery for already-stranded bundles and session restarts.

### D6 — Fail closed with typed evidence

Bundle ID/schema mismatch, missing terminal timestamp, transaction conflict, lock failure, and after-commit writer failure produce typed blocked/unverified outcomes. Success requires immediate archived readback of release done and Phase 9 done.

## Spec Obligations

- Modify `rq-releaseProjectionDurability01` with a scenario requiring archive-bundle release/Phase 9 persistence and derived-file readback when active projection is absent.
- Modify `rq-archiveTerminalDurability01.1` so “bundle rewriting skipped” applies to spec/delta reapplication and bundle recreation, not terminal projection synchronization.
- Preserve `rq-archiveRetryIdempotence01.1/.2` distinctions and `rq-archiveRecoveryConsistency01` proof rules.

## Test Strategy

1. RED: active-absent existing-bundle retry currently returns projection-not-verified.
2. GREEN: retry returns success, all gates/Phase 9 done, revision/audit exact, no active directory.
3. Exact replay: no revision or derived-hash drift.
4. Normal archive: bundle release done before active removal.
5. Derived artifacts: terminal summary hash binds exact regenerated `change.json`; original archive timestamp preserved.
6. Failure cases: corrupt/mismatched bundle, writer failure, missing shipped proof, lock/commit failure.
7. Regression: not-yet-archived route does not rewrite an external advisory bundle.

## Validation

Independent researcher verdict: **Confirmed with caution**, high confidence, medium risk, no blockers. Caution incorporated: include the sibling active-only `recordPhase9Status` path, normal first-run synchronization, original timestamp preservation, and the two spec-law modifications.