# Archive: Fix archive incomplete gates despite complete gate status

**Change ID:** fixArchiveIncompleteGates
**Archived:** 2026-05-09T21:31:24.521Z
**Created:** 2026-05-09T07:54:03.881Z

## Tasks Completed

- ✅ Add failing regression coverage for authoritative complete gates with stale/incomplete archive projection and for genuinely incomplete gates still blocking archive.
  > Extended change.test.ts with complete/incomplete gate fixtures, querySignal mock, and adv_change_archive tests for stale projection vs authoritative workflow gates.
- ✅ Implement archive gate-state source-of-truth refresh/overlay so stale cache/projection does not block valid archive while unknown/incomplete state remains blocked.
  > Imported querySignal/getGateStatusQuery and added applyAuthoritativeArchiveGates helper in change.ts. adv_change_archive now applies queried workflow gates to the change object before getArchivePreflightError.
- ✅ Run focused archive tests and plugin check; document verification evidence.
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[pattern]** Archive preflight must query workflow gate status via the same getGateStatusQuery path as adv_gate_status before enforcing allGatesSatisfied. Store/disk projections can lag after recovery; authoritative workflow gates should drive archive readiness while incomplete queried gates still block.
