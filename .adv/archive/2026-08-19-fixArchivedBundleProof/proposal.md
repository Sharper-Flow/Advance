# Fix archived bundle proof

## Intent

Make existing-bundle archive recovery select, mutate, prove, and finish from the surviving archive projection when no active projection exists.

## Root Cause Analysis

### Observed failure

After deploying `fixArchivedReleaseRepair`, retry correctly committed `gates.release.status=done` and `phase9_status.status=done` into the archive bundle, but returned:

`Archive durable release gate proof blocked: Cannot confirm release gate completion from disk projection (status: missing)`

### Causal path

Legacy bundles may have `status=archived` through bundle dominance while `lifecycleState` remains open or absent. The handler bypasses `reconcileArchivedBundleRetry` and follows the general archive path. Bundle recovery mutation then succeeds, but the next proof reads the deleted active projection. Even if that proof were corrected alone, the handler would next attempt active-only `archive_transition` and fail with `ARCHIVE_MUTATION_OPERATOR_REQUIRED`.

### Owning invariant

A cleanly absent active projection plus validated existing bundle must route the whole terminal recovery through that bundle. Mutation, proof, lifecycle convergence, and terminal return must share one authority; bundle recovery must never fall through to active retirement or cleanup.

## Scope

- Structurally route clean active absence to existing-bundle reconciliation before lifecycle-state heuristics.
- Route any bundle recovery proof to the repaired bundle and skip active-only transition/cleanup.
- Converge bundle lifecycle state in the recovery transaction.
- Reject foreign-ID bundle proof.
- Add real handler-level legacy lifecycle-open/absent regression coverage.
- Preserve active projection behavior and all existing release-proof, locking, idempotence, and no-resurrection rules.
- Deploy from merged trunk, restart runtime, then retry both archived recovery changes.

## Spec-Law Impact

**No spec-law change.** `rq-releaseProjectionDurability01.3` and `rq-archiveTerminalDurability01.1` already require same-authority bundle recovery, readback, terminal convergence, and exact replay.