# Archive: Fix archive terminal durability

**Change ID:** fixArchiveTerminalDurability
**Archived:** 2026-08-04T22:26:46.004Z
**Created:** 2026-08-04T02:09:21.609Z

## Tasks Completed

- ✅ Terminal durability: awaited projection write in workflow main function
  > Task checkpoint completed
- ✅ Remove the projection-read guard on the archive transition (Fault 1)
  > Task checkpoint completed
- ✅ Archive postcondition: prove the transition applied, never trust acceptance
  > Task checkpoint completed
- ✅ Replay fixture + determinism test for the patched terminal path
  > Task checkpoint completed
- ✅ Unify the status ladder and stop reporting absent features as measurements
  > Task checkpoint completed
- ✅ Repair: open the existing shipped_terminal convergence write to the no-workflow population
  > Task checkpoint completed
- ✅ Reconciliation: evaluate bundle evidence before the stale-disk veto, and surface skip reasons
  > Task checkpoint completed
- ✅ Release-gate projection: surface committed_unverified instead of warning and continuing
  > Task checkpoint completed
- ✅ Audit all five afterSuccess:false sites for silently-dropped durability
  > Task checkpoint completed
- ✅ End-to-end verification: retention expiry and phase-9-fails-after-bundle
  > Task checkpoint completed
- ✅ Spec deltas: durable terminal state and mutation-authority precedence
  > Task checkpoint completed

## Specs Modified

