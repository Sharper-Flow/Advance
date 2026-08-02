# Contract Traceability

**Change ID:** decoupleArchiveSharedCheckout
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-08-01T23:20:20.992Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Dirty/stale trunk tests pass. |
| SC2 | success_criterion | pass | review | Race/isolation suite passes. |
| SC3 | success_criterion | pass | review | All route regressions pass. |
| AC1 | acceptance_criterion | pass | test | No shared-main mutation tests pass. |
| AC2 | acceptance_criterion | pass | test | Fresh canonical remote proof verified. |
| AC3 | acceptance_criterion | pass | test | Detached integration route verified. |
| AC4 | acceptance_criterion | pass | test | No-remote now fails closed; recovery routes covered. |
| AC5 | acceptance_criterion | pass | test | Non-FF contention behavior covered. |
| AC6 | acceptance_criterion | pass | test | Legacy/retry compatibility tests pass. |
| AC7 | acceptance_criterion | pass | test | Specs/docs/assets reviewed aligned. |
| C1 | constraint | respected | static_check | Shared trunk never release mutation target. |
| C2 | constraint | respected | static_check | Remote failures block release. |
| C3 | constraint | respected | static_check | No unrelated destructive workaround. |
| DONT1 | avoidance | respected | review | No disk-only proof. |
| DONT2 | avoidance | respected | review | No manual reconstruction. |
| DONT3 | avoidance | respected | review | No global lock. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-efafa70f12a9 | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-1885d3319f8c | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-e46660db9cd6 | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-9add2a9dff6e | AC1, AC2, AC3, AC4, AC5, AC6 |  | C1, C2, C3, DONT1, DONT2, DONT3 |  |
| tk-b0c3586709ec |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, DONT1, DONT2, DONT3 |  |
