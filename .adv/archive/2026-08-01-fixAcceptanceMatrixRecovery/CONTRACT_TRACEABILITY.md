# Contract Traceability

**Change ID:** fixAcceptanceMatrixRecovery
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-01T17:35:15.488Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Recovery and reconciliation suites pass; reviewer READY. |
| SC2 | success_criterion | pass | review | Negative missing/failing matrix behavior remains covered. |
| AC1 | acceptance_criterion | pass | test | Recovery audit marker tests pass. |
| AC2 | acceptance_criterion | pass | test | Pre-gate clean signal re-delivery tests pass. |
| AC3 | acceptance_criterion | pass | test | Idempotent exact-match clear tests pass. |
| AC4 | acceptance_criterion | pass | test | End-to-end recovery acceptance tests pass. |
| AC5 | acceptance_criterion | pass | test | Matrix validation and disk recovery regression tests pass. |
| C1 | constraint | respected | static_check | Workflow signal/reducer remains readiness authority. |
| C2 | constraint | respected | static_check | No direct workflow seeding added. |
| DONT1 | avoidance | respected | review | No disk-only acceptance bypass. |
| DONT2 | avoidance | respected | review | Missing/failing matrix blockers preserved. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cecd4f4c44ca | AC1, AC2, AC3, AC5 |  | C1, C2, DONT1, DONT2 |  |
| tk-aeba2288a5cd |  | SC1, SC2, AC1, AC2, AC3, AC4, AC5 | C1, C2, DONT1, DONT2 |  |
