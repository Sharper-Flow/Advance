# Contract Traceability

**Change ID:** makeToolReadsWorkerFree
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-29T16:37:17.858Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Focused gate worker-free coverage passed; reviewer traced durable gate map and zero workflow-query behavior. |
| AC2 | acceptance_criterion | pass | test | Focused gate coverage passed; reviewer confirmed typed unavailable markers for non-projected criteria. |
| AC3 | acceptance_criterion | pass | test | Change projection/archived-list tests passed; reviewer confirmed degraded metadata behavior. |
| AC4 | acceptance_criterion | pass | test | Epic worker-free tests passed; reviewer confirmed projection-first rendering and unavailable live evaluation/convergence. |
| AC5 | acceptance_criterion | pass | test | Shared routine-read structural guard and focused handler tests passed. |
| AC6 | acceptance_criterion | pass | test | CLI bridge fail-closed regression passed; reviewer found no production CLI change. |
| C1 | constraint | respected | static_check | Committed diff contains no producer, workflow patch, or replay-semantic change. |
| C2 | constraint | respected | static_check | Mutations remain separate; only read handler behavior changed. |
| C3 | constraint | respected | static_check | CLI code/import boundary unchanged; CLI bridge regression passed. |
| C4 | constraint | respected | static_check | Gate and Epic worker-free paths emit typed unavailable markers rather than false absence. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-73d61d1ed2d6 | AC1, AC2 |  | C1, C2, C3, C4 |  |
| tk-ba36f4d47889 | AC3, AC5, AC6 |  | C1, C2, C3, C4 |  |
| tk-32c46f200d30 | AC4, AC5 |  | C1, C2, C3, C4 |  |
