# Contract Traceability

**Change ID:** integrateEpisodeMemory
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-13T03:00:27.707Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Reviewer READY; scoped recall grants and policy in adv.md/adv-researcher.md. |
| SC2 | success_criterion | pass | review | Policy explicitly continues when Episode unavailable. |
| SC3 | success_criterion | pass | review | No direct-write grants; existing wisdom flows unchanged. |
| AC1 | acceptance_criterion | pass | test | tool-name-assets test pins recall grant and top_k: 5. |
| AC2 | acceptance_criterion | pass | test | Policy text and test pin advisory-only handling. |
| AC3 | acceptance_criterion | pass | test | Policy pins graceful continuation on unavailable Episode. |
| AC4 | acceptance_criterion | pass | test | Test forbids episode_remember/forget/stats grants. |
| AC5 | acceptance_criterion | pass | test | Focused asset test 5/5 and full suite passed. |
| C1 | constraint | respected | static_check | No workflow-state integration added. |
| C2 | constraint | respected | static_check | top_k: 5 and active namespace policy. |
| C3 | constraint | respected | static_check | deploy-local exclusion test passed. |
| DONT1 | avoidance | respected | review | No write tools granted. |
| DONT2 | avoidance | respected | review | Advisory-only policy. |
| DONT3 | avoidance | respected | review | No ADV wisdom behavior removed. |
| DONT4 | avoidance | respected | review | Direct write tools forbidden by test. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No store replacement. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No source indexing. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No migration. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cc6e742fded2 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5 |  | C1, C2, C3, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3 |  |
| tk-38608e746e8e |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, C1, C2, C3 | DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3 |  |
