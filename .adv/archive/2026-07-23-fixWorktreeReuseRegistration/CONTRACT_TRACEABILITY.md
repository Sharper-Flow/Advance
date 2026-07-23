# Contract Traceability

**Change ID:** fixWorktreeReuseRegistration
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-23T04:21:43.672Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Independent reviewer READY: disk reuse plus absent workflow record now signals server-authoritative repair; index-create test proves guard predicate true without manual recreation. |
| AC1 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf targeted suite: index-create absent-map reuse test + reducer complete-record test. |
| AC2 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf: reducer test preserves setup_failed record and lastSignalAt exactly. |
| AC3 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf: metadata-rich exact no-op and ready-record no-signal tests. |
| AC4 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf: rejected repair delivery still resolves reused:true. |
| AC5 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf: reducer repeated-repair test and Temporal handler first-write-wins test. |
| AC6 | acceptance_criterion | pass | test | tr_mrwzz2jx_297bf7bf: corrected targeted 4-file suite passed; tr_mrx005fs_7978f132 pnpm run check passed. |
| C1 | constraint | respected | static_check | change-state.ts repair reducer performs workflow-side if-absent check; client only probes. |
| C2 | constraint | respected | static_check | change-state.ts early return on existing worktrees[branch] precedes all mutation. |
| C3 | constraint | respected | static_check | Repair reducer only assigns worktrees[branch] and lastSignalAt on absent insertion. |
| C4 | constraint | respected | static_check | Existing-record branch returns before setLastSignalAt; exact no-op tests pass. |
| C5 | constraint | respected | static_check | index.ts validates pathExists and rev-parse HEAD before query/signal. |
| C6 | constraint | respected | static_check | fireWorktreeSignal catches timeout/error; Step 0 ignores warning result and returns reused:true. |
| DONT1 | avoidance | respected | review | Dedicated worktreeRegistrationRepairedSignal added; worktreeCreatedSignal stays full-create-only. |
| DONT2 | avoidance | respected | review | Existing setup_failed record is reducer no-op; no readiness conversion. |
| DONT3 | avoidance | respected | review | Resume path unchanged; absent record falls through to Step 0. |
| DONT4 | avoidance | respected | review | Isolation guard untouched; repair restores the record it reads. |
| DONT5 | avoidance | respected | review | Full-create worktreeCreatedSignal path unchanged; targeted regression suite passes. |
| DONT6 | avoidance | respected | review | No client CAS/version heuristic; Temporal handler serializes if-absent repair. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-8eb927be80b4 | AC2, AC3, AC5 |  | C1, C2, C3, C4, DONT1, DONT2, DONT5, DONT6 |  |
| tk-4b93e0e307a0 | SC1, AC1, AC4 |  | C1, C5, C6, DONT1, DONT3, DONT4, DONT5 |  |
| tk-862323cdda1b |  | SC1, AC1, AC2, AC3, AC4, AC5, AC6 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
