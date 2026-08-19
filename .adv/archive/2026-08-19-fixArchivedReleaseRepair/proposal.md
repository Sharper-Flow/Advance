# Fix archived release repair

## Intent

Make Phase 9 existing-bundle recovery durably complete the release gate after a change has already moved from the active store into its archive bundle. Preserve canonical shipped proof and regenerate the archive’s derived projection files atomically.

## Root Cause Analysis

### Observed failure

`pokeedge::unifyPricingSourcePrecedence` shipped through merged PR #1277 (`f3786f535005b0155c6581da368bfa40e39221ff`). `adv_change_archive` returned `finalization.status=shipped`, but archived readback remained `gates.release.status=pending`. Existing-bundle retry again proved shipped status, then failed with `Archive release gate completion blocked: Release gate projection was not durably verified.` Direct gate recovery failed with `change not found`.

### Causal path

The archive bundle is generated before Phase 9 finalization and release-gate completion. `completeReleaseGateAfterFinalization` and `recordPhase9Status` mutate only `store.paths.changes`. Once normal archive retirement removes the active directory, existing-bundle retry has no mutation target even though `existingBundlePath` identifies the surviving authoritative terminal projection. The retry therefore proves Git release successfully but cannot commit or verify release state.

### Owning invariant

A shipped archive must have one durable terminal projection: the archive bundle’s `change.json` and derived summaries must record release completion and Phase 9 completion even when active state no longer exists. Active-store mutation cannot be the sole persistence route after retirement.

## Scope

- `plugin/src/tools/change/archive-gate.ts`
- `plugin/src/archive/archive.ts` and archive projection locking/terminal summary helpers
- Focused Phase 9/archive tests
- `.adv/specs/advance-workflow/spec.json` and its generated spec documentation where required

## LBP Targets

- Route writes by lifecycle location rather than assuming active state.
- Use `commitChangeProjection` for revision/audit/readback and the existing archive projection lock for terminal bundle mutation.
- Keep the archive bundle writer as the sole authority for `change.json`, terminal summary, archive summary, briefing digest, and narrative projection.
- Fold release-gate and Phase 9 completion into one archive recovery transaction.
- Preserve original `archived_at` across regeneration and make retries idempotent.

## User Outcomes

- A merged PR can finish ADV release state after session restart.
- Archived changes never remain terminal with `release=pending` after shipped proof.
- No manual state-file editing, active-change resurrection, purge, or retired repair tool is needed.

## Spec-Law Impact

**Modify.** Existing behavior is already required by `rq-releaseFinalization01`, `rq-releaseProjectionDurability01`, and `rq-archiveRecoveryConsistency01`. Two clarifications are needed:

1. `rq-releaseProjectionDurability01` must pin the archive bundle as the durable release projection when active state is absent, including readback and derived-file consistency.
2. `rq-archiveTerminalDurability01.1` must distinguish skipping spec/delta reapplication and bundle recreation from the required terminal release-metadata synchronization on existing-bundle reconciliation.

No new release authority or proof standard is introduced.