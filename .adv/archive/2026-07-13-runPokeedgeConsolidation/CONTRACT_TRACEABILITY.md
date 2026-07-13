# Contract Traceability

**Change ID:** runPokeedgeConsolidation
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-13T16:14:21.478Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | 44 focused tests pass: adv_run_test tr_mrjf8skw_e600e7ca; 7s bound and typed EpicQueryTimeoutError asserted in store-consolidate.test.ts. |
| AC2 | acceptance_criterion | pass | test | Timeout test asserts failed outcome, no recreate, no Epic ledger row, and terminal-first preservation; focused suite passed. |
| AC3 | acceptance_criterion | pass | test | Lifecycle test asserts one default bundle and awaited close before resolve; direct test observes late rejection and no false timeout. |
| AC4 | acceptance_criterion | pass | test | Focused 44-test suite passed (tr_mrjf8skw_e600e7ca); pnpm run check passed (tr_mrjf1sud_35aeb03f). |
| AC5 | acceptance_criterion | pass | test | Parent has no live tasks: four cancelled with user approval and child runPokeedgeRecovery linked; no live execution occurred after scope reduction. |
| C1 | constraint | respected | static_check | Acceptance reviewer removed manual reconstruction guidance; assertions prohibit manual remediation wording. |
| C2 | constraint | respected | static_check | No parent live store operation executed after branch fix; child explicitly waits for deployed trunk. |
| C3 | constraint | respected | static_check | Diff limited to store-consolidate timeout/cleanup and focused tests. |
| C4 | constraint | respected | static_check | Four parent live-operation tasks are cancelled; linked child runPokeedgeRecovery owns live recovery. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Live recovery deferred to linked child runPokeedgeRecovery. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No further consolidation features added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No source-store deletion implemented or executed. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-23d9afbb8df8 |  |  |  | Historical live-recovery preflight was superseded by linked child runPokeedgeRecovery after parent scope reduced to bounded-query release. |
| tk-4d1d5d25340a |  |  |  | Historical live-recovery approval was superseded by linked child runPokeedgeRecovery; parent performs no live consolidation. |
| tk-da7c497ca0f3 | AC2, AC3, AC5 |  | C1, C2, C3, C4, OOS1, OOS2, OOS3 |  |
| tk-9cdd1a1f77e2 |  | AC3, AC4, AC5 | C2, C3, C4, OOS2, OOS3 |  |
| tk-3e486ce4264f | AC2, AC3, AC5 |  | C1, C2, C3, C4, OOS1, OOS2, OOS3 |  |
| tk-74456e556813 |  | AC4, AC5 | C1, C2, C3, C4, OOS2, OOS3 |  |
| tk-36ce494039f7 | AC1, AC2, AC3, AC4 | AC1, AC2, AC3, AC4 | C1, C2, C3, OOS1, OOS2, OOS3 |  |
