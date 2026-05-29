# Archive: complete state-backed gate migration

**Change ID:** completeStateBackedGate
**Archived:** 2026-05-29T04:42:18.877Z
**Created:** 2026-05-29T00:24:45.796Z

## Tasks Completed

- ✅ RED: failing store-level test for updateArtifacts cache invalidation (AC9)
  > Task checkpoint completed
- ✅ GREEN: add invalidateChange(changeId) to updateArtifacts (AC9, root cause of stale-contract symptom)
  > Task checkpoint completed
- ✅ RED: failing unit test for readAgreement Temporal-first ordering (AC8)
  > Task checkpoint completed
- ✅ GREEN: make readAgreement Temporal-first by delegating to readArtifact (AC8)
  > Task checkpoint completed
- ✅ RED: failing test for state-backed acceptance gate (no-disk) through workflow signal path (AC1, AC5)
  > Task checkpoint completed
- ✅ GREEN: state-backed acceptance non-recovery branch behind new patch marker (AC1, AC3, AC7, AC2, C2, C3)
  > Task checkpoint completed
- ✅ Test: recovery-path + replay-determinism coverage (AC2, AC3)
  > Task checkpoint completed
- ✅ Test: legacy on-disk acceptance compatibility + archive-bundle executive-summary materialization (AC4, AC7)
  > Task checkpoint completed
- ✅ Docs: update fixGateArtifactReadiness recovery note + workflows.ts inline comments (AC6)
  > Task checkpoint completed
- ✅ Verification gate: full suite + invariants + revert guard flip (C1, C6)
  > Task checkpoint completed

## Specs Modified


## Wisdom Accumulated

- **[gotcha]** readAgreement (tools/contract.ts:91-106) is disk-first, Temporal-fallback: reads agreement.md from disk, only falls back to change.documents?.agreement when disk is empty/missing. In the Temporal-canonical architecture this is backwards — Temporal state.documents should be the canonical source, disk the legacy fallback. It did NOT cause the stale-contract symptom here (disk absent → fallback fired), but it's the same architectural class this change addresses. Separate finding: stale 12-item contract was a read-after-write gap on change.documents between adv_change_update and an immediately-following non-dry adv_contract_mint force:true; dryRun re-read returned correct 13 items, proving state was fresh and only the persisted contract was stale. Mitigation: when re-minting after adv_change_update, run a dryRun first to confirm freshness, or re-mint twice. Candidate follow-up: invert readAgreement (and sibling artifact readers in contract.ts / change.ts) to Temporal-first.
