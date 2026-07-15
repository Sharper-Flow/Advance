# Contract Traceability

**Change ID:** addRewriteScanPrompts
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-15T18:45:53.449Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | `plugin/src/adv-arch-scan-assets.test.ts` passes and asserts both rewrite questions, evidence rules, indeterminate status, and command-level rewriteAssessment. |
| AC2 | acceptance_criterion | pass | test | `plugin/src/adv-slop-scan-assets.test.ts` passes and asserts both rewrite questions, evidence rules, indeterminate status, and command-level rewriteAssessment. |
| AC3 | acceptance_criterion | pass | test | Targeted asset suite passed 25/25; both commands and skills state source/tool or finding-reference evidence and tentative heuristic treatment. |
| AC4 | acceptance_criterion | pass | test | Both command contracts define `REWRITE ASSESSMENT` text output and command-level `rewriteAssessment.wouldChange` / `wouldNotCarryOver` objects. |
| AC5 | acceptance_criterion | pass | test | Both command and skill pairs are covered by new assertions in the two asset-test files; targeted suite passed 25/25. |
| C1 | constraint | respected | static_check | Reviewed diff confines changes to contracts, skills, and asset tests; rewrite assessment explicitly preserves severity, actionability, coverage, and deletion safeguards. |
| C2 | constraint | respected | static_check | Reviewed diff touches no scanner runtime code or `slop_scan_report.v1`; commands explicitly state command-level semantics only. |
| DONT1 | avoidance | respected | review | Independent reviewer verdict READY; assessment requires evidence and returns no definite conclusion where evidence is absent. |
| DONT2 | avoidance | respected | review | Independent reviewer verdict READY; both contracts state assessment never authorizes deletion, refactor, or remediation. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b7b8b9897843 | AC1, AC2, AC3, AC4, AC5 |  | C1, C2, DONT1, DONT2 |  |
