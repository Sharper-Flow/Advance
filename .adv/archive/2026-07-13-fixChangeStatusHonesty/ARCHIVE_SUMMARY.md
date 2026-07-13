# Archive: Fix change status honesty

**Change ID:** fixChangeStatusHonesty
**Archived:** 2026-07-13T22:57:10.708Z
**Created:** 2026-07-13T18:56:34.625Z

## Tasks Completed

- ✅ Surface derived `phase` in adv_change_list rows
  > Task checkpoint completed
- ✅ Fail-closed reject of status:"active"|"pending" filter with hint
  > Task checkpoint completed
- ✅ Add legacy-status load normalizer + reconcile byStatus/seedState/bulk-close
  > Task checkpoint completed
- ✅ Remove pending/active from ChangeStatusSchema + simplify legacy-open sets
  > Task checkpoint completed
- ✅ Spec delta + docs: record reachable ChangeStatus set
  > Task checkpoint completed
- ✅ Final verification: full check + AC5 invariant proof + cross-path consistency
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** GateId types as plain `string` (GATE_IDS is cast to `[string, ...string[]]` before z.enum), so `Record<GateId, X>` / mapped types over GateId become true string-index-signature types. Concrete interfaces without index signatures (e.g. GateProgress in store-temporal-memo.ts) are NOT assignable to them, and `gates[gateId]` indexing fails on unions. Fix pattern: accept a union of the concrete shapes (Gates | GateProgress) and index through one contained, documented `as Record<string, ...>` cast (see firstOpenGate in storage/store-types.ts).
