# Contract Traceability

**Change ID:** fixEpicRepair
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T19:53:18.403Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | GREEN tr_mrchex44_ad91b4df and verify tr_mrcho4ne_4640f2ce: workflows.search-attrs test includes legacy `searchAttributesEnabled:false` Epic refresh and passed; reviewer verdict READY. |
| AC2 | acceptance_criterion | pass | test | GREEN tr_mrchif7k_54fe0e33 and verify tr_mrcho4ne_4640f2ce: store-temporal/epics.test proves confirmed refresh after describe proof and unverified reporting; reviewer verdict READY. |
| AC3 | acceptance_criterion | pass | test | Verify tr_mrchncyl_a6720ccf and tr_mrcho4ne_4640f2ce: list-change-workflows.test passed and asserts default open listing uses AdvLifecycleState and not AdvChangeStatus; reviewer verdict READY. |
| AC4 | acceptance_criterion | pass | test | Verify tr_mrcho4ne_4640f2ce: 142 targeted tests passed; tr_mrchop9i_2ec85564: `pnpm run check` passed. |
| C1 | constraint | respected | static_check | `pnpm run check` tr_mrchop9i_2ec85564 passed typecheck/lint; reviewer confirmed workflow-bundle-safe deterministic changes. |
| C2 | constraint | respected | static_check | repairIndex uses workflow describe point-value proof before incrementing confirmed `refreshed`; unverified signal delivery is separate. |
| C3 | constraint | respected | static_check | Forced repair signal upserts current Epic status on the existing running workflow; no restart/recreate path introduced. |
| C4 | constraint | respected | static_check | Synchronous confirmation uses `handle.describe()` point-value proof; list-query propagation is not the sole success proof. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f77c3254e142 |  | AC1, AC2, AC4 | C1, C2, C4 |  |
| tk-9a3f9b1748fa | AC1 |  | C1, C2, C3, C4 |  |
| tk-b798186127f1 | AC2 | AC2 | C2, C4 |  |
| tk-1528f02b4a2d | AC1, AC2 | AC1, AC2 | C2 |  |
| tk-0d7cd34975fa | AC3 | AC3 | C1, C2, C3 |  |
