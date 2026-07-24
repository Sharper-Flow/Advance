# Contract Traceability

**Change ID:** fixArchiveConvergence
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-24T22:46:07.300Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Bounded 3s query + AbortController; TemporalQueryTimeoutError routes to recovery |
| AC2 | acceptance_criterion | pass | test | describe() TERMINATED pre-check skips query |
| AC3 | acceptance_criterion | pass | test | archiveConvergedSignal applies 3 mutations before first await |
| AC4 | acceptance_criterion | pass | test | saveRecoveredArchiveConvergence single saveChange all 4 fields |
| AC5 | acceptance_criterion | pass | test | wf.patched archive-converged-v1; replay-determinism 13/13 |
| AC6 | acceptance_criterion | pass | test | Requires shipped proof; forge-guard preserved |
| C1 | constraint | respected | static_check | All writes via saveChange |
| C2 | constraint | respected | static_check | Operator-gated recovery |
| C3 | constraint | respected | static_check | Operator-gated |
| C4 | constraint | respected | static_check | No storage/tools imports in handler |
| C5 | constraint | respected | static_check | 3s < 15s |
| DONT1 | avoidance | respected | review | No bare Promise.race |
| DONT2 | avoidance | respected | review | No QueryRejectCondition |
| DONT3 | avoidance | respected | review | New signal not in-place |
| DONT4 | avoidance | respected | review | Single atomic signal |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-fa90cf620454 | AC1, AC2 |  | C5, DONT1, DONT2 |  |
| tk-b10585f3d568 | AC3, AC5 |  | C1, C4, DONT3, DONT4 |  |
| tk-04b3603c315d | AC4, AC6 |  | C2, C3 |  |
