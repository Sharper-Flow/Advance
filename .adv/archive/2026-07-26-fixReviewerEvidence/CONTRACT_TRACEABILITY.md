# Contract Traceability

**Change ID:** fixReviewerEvidence
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-25T21:18:01.368Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | subagent-report + gate-readiness tests. tr_ms0ujmvp, tr_ms0v2cg0. |
| AC2 | acceptance_criterion | pass | test | gate-readiness AC2 regression. tr_ms0v2cg0. |
| AC3 | acceptance_criterion | pass | test | gate-readiness AC3 warn-first. tr_ms0v2cg0. |
| AC4 | acceptance_criterion | pass | test | gate-readiness AC4 change-scoped rejected. tr_ms0v2cg0. |
| AC5 | acceptance_criterion | pass | test | subagent-report TDD red->green. tr_ms0ujmvp. |
| C1 | constraint | respected | static_check | task-classifier.ts:382-394 unchanged. |
| C2 | constraint | respected | static_check | subagent-reports.ts:50-67,471-477 unchanged. |
| C3 | constraint | respected | static_check | subagent-report.ts:493-587 unchanged. |
| C4 | constraint | respected | static_check | Direction (2) rejected; no auto-record. |
| C5 | constraint | respected | static_check | subagent-reports.ts:471-477 unchanged. |
| DONT1 | avoidance | respected | review | AC2 confirms block for test/static_check. |
| DONT2 | avoidance | respected | review | Direction (2) rejected. |
| DONT3 | avoidance | respected | review | Direction (3) rejected. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f0b4525a6dd8 |  |  | C1, C2, C5 |  |
| tk-feabc293e2b7 | AC1, AC5 | AC1, AC5 | C1, C3, C4, DONT1, DONT2 |  |
| tk-0c23472dfede |  | AC2, AC3, AC4 | C2, C5 |  |
