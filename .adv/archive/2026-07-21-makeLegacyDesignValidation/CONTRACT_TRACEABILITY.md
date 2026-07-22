# Contract Traceability

**Change ID:** makeLegacyDesignValidation
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-20T19:42:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | AC1 verified: subagent-reports.test.ts updated assertion + multi-string round-trip. 56 tests pass. RunId tr_mrtm37nv_a246d77d. |
| AC2 | acceptance_criterion | pass | test | AC2 verified: subagent-reports.archive-through.test.ts fixture passes. ChangeSchema.parse accepts wedged shape. |
| AC3 | acceptance_criterion | pass | test | AC3 verified: handler tests (rejection + C7 ordering + scope isolation). All pass. |
| AC4 | acceptance_criterion | pass | test | AC4 verified: structurally via AC1. All read tools use ChangeSchema.parse. |
| AC5 | acceptance_criterion | pass | test | AC5 verified: bin/oc-test targeted, 241 tests green across 9 files. |
| C1 | constraint | respected | static_check | C1 respected: handler relocates check with identical failure shape. |
| C2 | constraint | respected | static_check | C2 respected: sibling superRefine checks preserved verbatim. |
| C3 | constraint | respected | static_check | C3 respected: no coercion; tests assert verbatim preservation. |
| C4 | constraint | respected | static_check | C4 respected: recovery writer unchanged; uses loose interface. |
| C5 | constraint | respected | static_check | C5 respected: no bundled scope; 5 commits within relocation. |
| C6 | constraint | respected | static_check | C6 respected: strict equality check; no heuristic. |
| C7 | constraint | respected | static_check | C7 respected: string check before AC13 flatMap; ordering test proves it. |
| DONT1 | avoidance | respected | review | DONT1 respected: no migration tool or on-disk rewrite. |
| DONT2 | avoidance | respected | review | DONT2 respected: no new exported symbol or public API. |
| DONT3 | avoidance | respected | review | DONT3 respected: no spec delta; rq-subagentReports24 unchanged. |
| DONT4 | avoidance | respected | review | DONT4 respected: no fixPoisonedRecovery changes; recovery code untouched. |
| DONT5 | avoidance | respected | review | DONT5 respected: no Vision report migration/coercion; reports stay verbatim. |
| DONT6 | avoidance | respected | review | DONT6 respected: no #258 re-opening; schema-error surfacing untouched. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1c747e9883f4 |  |  | C2, C6 |  |
| tk-5a8e1235c5d1 | AC3 |  | C1, C7 |  |
| tk-a217f2c95d8f | AC3 |  | C7 |  |
| tk-cf7a5766dadf | AC5 |  |  |  |
| tk-cbb5da8dc864 | AC1 | AC4 |  |  |
| tk-808ec7625345 | AC2 |  |  |  |
