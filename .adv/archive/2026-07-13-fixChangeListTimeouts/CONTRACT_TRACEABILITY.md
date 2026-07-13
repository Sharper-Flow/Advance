# Contract Traceability

**Change ID:** fixChangeListTimeouts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T16:03:39.702Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Post-remediation reviewer READY; typed bounded/degraded outcome verified. |
| SC2 | success_criterion | pass | review | Summary bound and authoritative-state behavior retained by existing focused coverage and reviewer. |
| SC3 | success_criterion | pass | review | Request-local hydration reuse remains covered by prior acceptance tests; remediation did not touch enrichment. |
| SC4 | success_criterion | pass | review | Reviewer verified source/candidate deadline degradation remains explicit after remediation. |
| AC1 | acceptance_criterion | pass | test | New fast Temporal failure plus slow disk fallback RED→GREEN test; bounded-read suite 12/12 passed. |
| AC2 | acceptance_criterion | pass | test | Prior complete-path coverage remains green; remediation only bounds fallback reads. |
| AC3 | acceptance_criterion | pass | test | Post-remediation scoped 122/122 includes status/list bounded-read coverage. |
| AC4 | acceptance_criterion | pass | test | Existing hydration call-count regression remains covered; remediation did not alter enrichment. |
| AC5 | acceptance_criterion | pass | test | New slow archive fallback regression passes with typed bounded handling. |
| AC6 | acceptance_criterion | pass | test | Fast Temporal failure + slow disk/archive fallback regression, bounded-read 12/12, storage/temporal 666 tests, and scoped 122/122 passed without outer timeout. |
| C1 | constraint | respected | static_check | No authoritative TTL cache introduced; reviewer/diff inspection confirms request-scoped mechanisms only. |
| C2 | constraint | respected | static_check | Fallback deadline tests assert explicit bounded degradation rather than silent omission. |
| C3 | constraint | respected | static_check | Existing deadline context reused; no outer timeout workaround introduced. |
| C4 | constraint | respected | static_check | Remediation explicitly covers disk/archive candidate fallback path. |
| C5 | constraint | respected | static_check | No target-path authority/accounting change in remediation. |
| C6 | constraint | respected | static_check | pnpm run check passed; bounded read follows existing schema/workflow/test boundaries. |
| DONT1 | avoidance | respected | review | No worker restart, poisoned mutation, or timeout-ceiling increase. |
| DONT2 | avoidance | respected | review | No list-level stale cache authority added. |
| DONT3 | avoidance | respected | review | Archive fallback is deadline-wrapped; no unbounded archive scan introduced. |
| DONT4 | avoidance | respected | review | Diff limited to bounded fallback test/path and formatting; no broad adapter/change.ts refactor. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-14b7d32f4775 | AC1, AC2 |  | C1, C2, C3, C6, DONT1, DONT2 |  |
| tk-bd6e4d2adece | AC1, AC2, AC5 |  | C1, C2, C4, C6, DONT3 |  |
| tk-4a18a6d53fb2 | AC3, AC4 |  | C1, C2, C3, C5, C6, DONT2, DONT4 |  |
| tk-5b7692bf8b01 |  |  | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4 |  |
| tk-bc3bf9864128 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4 |  |
| tk-c7dd87981a06 | AC1, AC5, AC6, SC1, SC4 |  | C1, C2, C3, C4, C6, DONT1, DONT2, DONT3, DONT4 |  |
