# Archive: Fix ADV state authority

**Change ID:** fixAdvStateAuthority
**Archived:** 2026-08-05T20:09:28.625Z
**Created:** 2026-08-04T22:56:02.890Z

## Tasks Completed

- ✅ Diagnose actual cause of stale enumeration rows before implementing
  > Task checkpoint completed
- ⏭️ KD1: project terminal state in archiveChangeSignal
- ✅ KD2: per-id archive dominance in list/listSummary hydration
  > Task checkpoint completed
- ✅ KD3: emit terminal-resolution degradation regardless of query kind
  > Task checkpoint completed
- ✅ KD4: cross-surface enumeration invariant test
  > Task checkpoint completed
- ✅ KD5a: fail closed on invalid project identity at the resolver
  > Task checkpoint completed
- ✅ KD5b: root test-mode stores outside the production data home
  > Task checkpoint completed
- ✅ Prevent test fixtures reaching the live Temporal namespace
  > Task checkpoint completed
- ✅ Bundle-generation guard must fail the read and name the correct process
  > Task checkpoint completed
- ✅ Reconcile Epic listing with Epic workflow reality
  > Task checkpoint completed
- ✅ Ship the machine-wide census as a repeatable diagnostic
  > Task checkpoint completed
- ✅ Remove synthetic and malformed identity stores, dry-run first
  > Task checkpoint completed
- ✅ Consolidate duplicate identity stores via adv_store_consolidate
  > Task checkpoint completed
- ✅ End abandoned workflows by self-completion signal, per-workflow evidence
  > Task checkpoint completed
- ✅ Apply cleanup across the other 16 projects, per-project approval
  > Task checkpoint completed
- ✅ Backfill stale terminal records in this project
  > Task checkpoint completed
- ✅ Spec deltas: enumeration terminality, degradation provenance, architecture authority
  > Task checkpoint completed
- ✅ Close changes that are no longer needed, with typed reason and approval
  > Task checkpoint completed

## Specs Modified

- **advance-workflow**: 2 delta(s)
- **advance-meta**: 1 delta(s)

## Wisdom Accumulated

- **[gotcha]** Cross-project ADV writes are blocked by design from a single host session. TemporalOperationsOwner (plugin/src/temporal/operations.ts:580) is constructed once with the host session's projectId; withTargetPathStore opens the target project's disk store but reuses the host's Temporal client, so validateContext (operations.ts:410-423) throws `projectId mismatch` before any signal fires. Reads work cross-project (disk snapshot path); writes never do. recoveryMode:poisoned_history does not cover this (its regex matches TMPRL1100/Nondeterminism/completed-workflow, not projectId mismatch). Workarounds used elsewhere in this change bypass the SDK entirely (direct `temporal workflow signal/terminate` CLI for workflow termination; direct filesystem for store removal) — but ADV-native lifecycle ops (adv_change_bulk_close, adv_change_archive) have no such bypass since they coordinate SDK-owned state. Closing/archiving foreign-project changes requires either a session rooted in each target repo, or an SDK change adding a per-target TemporalOperationsOwner (getServiceForProject). Discovered during tk-44c6afb7af6b: 4 of 190 close candidates closed (host project); 186 blocked by this invariant.
