# Contract Traceability

**Change ID:** fixArchivedProvenanceRecovery
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-08-02T21:37:56.717Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | All required-provenance routes block when missing. |
| SC2 | success_criterion | pass | review | Valid and not-applicable provenance routes pass. |
| SC3 | success_criterion | pass | review | Terminal recovery is proof-bound and idempotent. |
| AC1 | acceptance_criterion | pass | test | Release-pending preflight blocks missing provenance. |
| AC2 | acceptance_criterion | pass | test | Recovery/rescue writers share provenance enforcement. |
| AC3 | acceptance_criterion | pass | test | Shipped rescue requires provenance plus Git proof. |
| AC4 | acceptance_criterion | pass | test | Required-valid and not-applicable cases pass. |
| AC5 | acceptance_criterion | pass | test | Archived pending recovery validates immutable proof. |
| AC6 | acceptance_criterion | pass | test | 232 targeted and 179 verification route tests pass; specs/schema updated. |
| C1 | constraint | respected | static_check | Replay-safe normal workflow enforcement preserved. |
| C2 | constraint | respected | static_check | Recovery evaluates durable projection state only. |
| DONT1 | avoidance | respected | review | No release-readiness bypass. |
| DONT2 | avoidance | respected | review | No archive bundle or workflow-history edits. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-80c5f2f0e86f | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5 |  | C1, C2, DONT1, DONT2 |  |
| tk-f890ae188980 | AC6 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, DONT1, DONT2 |  |
