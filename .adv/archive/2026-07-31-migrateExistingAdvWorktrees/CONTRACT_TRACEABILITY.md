# Contract Traceability

**Change ID:** migrateExistingAdvWorktrees
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-31T01:24:00.210Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; dual-staleness tested. |
| SC2 | success_criterion | pass | review | Reviewer READY; directory-only detach and rollback tested. |
| SC3 | success_criterion | pass | review | Reviewer READY; receipt persistence tested. |
| AC1 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC2 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC3 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC4 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC5 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC6 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC7 | acceptance_criterion | pass | test | tr_ms898ppl_19b17ff7 |
| AC8 | acceptance_criterion | pass | test | tr_ms89dt6c_6ce38a88 |
| AC9 | acceptance_criterion | pass | test | tr_ms89dt6c_6ce38a88 |
| C1 | constraint | respected | static_check | Reviewer READY; dual-clock guard. |
| C2 | constraint | respected | static_check | Reviewer READY; exact batch binding. |
| C3 | constraint | respected | static_check | Reviewer READY; branch and records preserved. |
| C4 | constraint | respected | static_check | Reviewer READY; shared Git helper. |
| C5 | constraint | respected | static_check | Reviewer READY; unavailable state refuses. |
| C6 | constraint | respected | static_check | Reviewer READY; durable receipts. |
| DONT1 | avoidance | respected | review | Reviewer READY; no lifecycle mutation. |
| DONT2 | avoidance | respected | review | Reviewer READY; directory-only. |
| DONT3 | avoidance | respected | review | tr_ms89dt6c_6ce38a88 lifecycle boundary suite. |
| DONT4 | avoidance | respected | review | Reviewer READY; terminal cleanup unchanged. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No production or cross-project mutation. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No automatic garbage collection or live migration. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b6db4c282071 | AC4, AC5, AC6, AC7 |  | C3, C4, C5, C6, DONT1, DONT2, DONT4 |  |
| tk-4961a653458e | AC1, AC2, AC3, AC4, AC6, AC7, AC8 |  | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
| tk-699853a8fc59 | AC5, AC8, AC9 |  | C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
