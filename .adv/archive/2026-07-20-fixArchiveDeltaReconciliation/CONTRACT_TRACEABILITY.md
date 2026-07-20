# Contract Traceability

**Change ID:** fixArchiveDeltaReconciliation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T15:48:02.850Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; immutable projection proof enforced. |
| SC2 | success_criterion | pass | review | Retry fixed-point and no rebump verified. |
| SC3 | success_criterion | pass | review | Repair reached 323 complete, zero remaining repair/conflict. |
| SC4 | success_criterion | pass | review | Parent laws restored; rq24 single-copy preserved. |
| SC5 | success_criterion | pass | review | Targeted/full/check/build pass. |
| AC1 | acceptance_criterion | pass | test | Archive and immutable proof suites pass. |
| AC2 | acceptance_criterion | pass | test | Existing-bundle fixed-point tests pass. |
| AC3 | acceptance_criterion | pass | test | Conflict/unverified zero-write tests pass. |
| AC4 | acceptance_criterion | pass | test | Historical classification/live repair verified. |
| AC5 | acceptance_criterion | pass | test | Single/batch status proof gates pass. |
| AC6 | acceptance_criterion | pass | test | Route and replay suites pass. |
| AC7 | acceptance_criterion | pass | test | Parent laws, versions, docs, rq24 verified. |
| AC8 | acceptance_criterion | pass | test | Crash recovery and retry suites pass. |
| AC9 | acceptance_criterion | pass | test | Rejected postimage never written. |
| C1 | constraint | respected | static_check | Archive reconciler solely wrote specs. |
| C2 | constraint | respected | static_check | Current-repository scope retained. |
| C3 | constraint | respected | static_check | Archive evidence/state unchanged. |
| C4 | constraint | respected | static_check | Replay fixtures pass. |
| C5 | constraint | respected | static_check | Bounded deterministic proof. |
| C6 | constraint | respected | static_check | Unproven history fails closed. |
| DONT1 | avoidance | respected | review | No manual final-state spec edit. |
| DONT2 | avoidance | respected | review | Hashes, not IDs alone, authorize. |
| DONT3 | avoidance | respected | review | Conflict required exact approval. |
| DONT4 | avoidance | respected | review | Parent evidence not rewritten. |
| DONT5 | avoidance | respected | review | Release/gate order preserved. |
| DONT6 | avoidance | respected | review | Cleanup scope unchanged. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-a55a31110a66 | AC2, AC3, AC9, SC2, C5, C6 | AC2, AC3, AC9 | DONT2, DONT3, OOS4 |  |
| tk-e8f41a65d57c | AC1, AC2, AC8, SC1, SC2, C1, C4 | AC1, AC2, AC8 | DONT1, DONT3, DONT5, OOS2, OOS3 |  |
| tk-4acc43ae3fc4 | AC5, AC6, SC1, C1, C3, C4 | AC5, AC6 | DONT4, DONT5, OOS2 |  |
| tk-449548218e1f | AC2, AC4, AC5, AC6, AC9, SC2, SC3, C2, C3, C5, C6 | AC2, AC4, AC5, AC6, AC9 | DONT1, DONT3, DONT4, DONT5, DONT6, OOS1, OOS3, OOS4 |  |
| tk-4fadb8dc9e2c | AC7, SC3, SC4 | AC4, AC7 | C2, C3, C6, DONT1, DONT3, DONT4, OOS1, OOS4 |  |
| tk-8e8cc6071db0 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, SC1, SC2, SC3, SC4, SC5, C1, C2, C3, C4, C5, C6 | DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-ef858d50bea4 | AC4, AC7, AC9, SC3, SC4, C3, C4, C5, C6 | AC4, AC7, AC9 | DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS4 |  |
