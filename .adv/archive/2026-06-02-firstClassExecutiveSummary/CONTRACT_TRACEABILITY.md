# Contract Traceability

**Change ID:** firstClassExecutiveSummary
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-02T20:35:58.271Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Archive fallback tests in change.test.ts cover all 5 include flags for archived changes |
| AC2 | acceptance_criterion | pass | test | Same archive-fallback helper (findArchiveBundle) used for all 5 flags |
| AC3 | acceptance_criterion | pass | test | auto-release.yml CHANGELOG step updated with executive summary injection; actionlint clean |
| AC4 | acceptance_criterion | pass | test | Corded tests pass for sibling exec-summary loading and prompt rendering |
| AC5 | acceptance_criterion | pass | test | Full verification passed: ADV check/test/build, Corded cargo build/test |
| C1 | constraint | respected | static_check | Optional String field with fallback for missing files |
| C2 | constraint | respected | static_check | No new tools or schemas added — extends existing include flags |
| C3 | constraint | respected | static_check | No duplicated Corded prompt logic |
| DONT1 | avoidance | respected | review | No GitHub issue closure comment changes |
| DONT2 | avoidance | respected | review | No dedicated aggregator tool |
| DONT3 | avoidance | respected | review | No archive compression changes |
| OOS1 | out_of_scope | not_applicable | not_applicable | GitHub issue closure comments out of scope |
| OOS2 | out_of_scope | not_applicable | not_applicable | Aggregator tool out of scope |
| OOS3 | out_of_scope | not_applicable | not_applicable | Corded gate-name set out of scope |
| OOS4 | out_of_scope | not_applicable | not_applicable | Archive compression out of scope |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2e069d703019 | AC1, AC2 |  |  |  |
| tk-61b0956fc80d | AC1, AC2 |  |  |  |
| tk-17de9d92b530 | AC3 |  |  |  |
| tk-79fdef349f18 | AC4 |  |  |  |
| tk-e19c4d90567b | AC4 |  |  |  |
| tk-838aeeb636a9 |  | AC1, AC2, AC3, AC4, AC5 |  |  |
