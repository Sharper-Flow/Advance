# Contract Traceability

**Change ID:** refineTestEvidencePolicy
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-17T23:36:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Independent acceptance review READY; task evidence plan is persisted and resolver-backed. |
| SC2 | success_criterion | pass | review | Review route now requires bounded rationale and conclusion; reviewer verified task-create gap fix. |
| SC3 | success_criterion | pass | review | Resolver and readiness integration tests cover structured review proof for uncertain logic-bearing work. |
| SC4 | success_criterion | pass | review | Reviewer guidance/spec updates require safe local cleanup without repository-wide obligation. |
| AC1 | acceptance_criterion | pass | test | Task classifier, prep readiness, completion, and task-tool tests passed; full suite passed post-remediation. |
| AC2 | acceptance_criterion | pass | test | Task-tool review-route acceptance/rejection tests pass; rationale and review conclusion are structurally validated. |
| AC3 | acceptance_criterion | pass | test | Resolver/readiness tests cover permitted structured review proof and rejected unsupported routes. |
| AC4 | acceptance_criterion | pass | test | Spec/command asset tests pass for reviewer-owned safe local cleanup guidance. |
| AC5 | acceptance_criterion | pass | test | Gate-readiness tests and resolver partition retain advisory quality signals outside completion authority. |
| AC6 | acceptance_criterion | pass | test | Legacy normalization and additive completion-proof tests passed. |
| AC7 | acceptance_criterion | pass | test | Behavior-critical not_applicable route rejection is covered by resolver and prep-readiness tests. |
| C1 | constraint | respected | static_check | Spec and code review found no numeric quota logic. |
| C2 | constraint | respected | static_check | Existing evidence-policy alternatives remain available; no universal red/green rule added. |
| C3 | constraint | respected | static_check | No dependency or lockfile addition in change diff. |
| C4 | constraint | respected | static_check | Pure resolver and typed schemas own compatibility; heuristic signals remain advisory. |
| C5 | constraint | respected | static_check | Legacy provenance and additive proof records preserve historical readability. |
| DONT1 | avoidance | respected | review | No PokeEdge/PokeEdge Web cleanup changes included. |
| DONT2 | avoidance | respected | review | No worker-cap changes included. |
| DONT3 | avoidance | respected | review | No suite-isolation changes included. |
| DONT4 | avoidance | respected | review | Implementation extends existing task/contract model rather than a parallel policy store. |
| DONT5 | avoidance | respected | review | Review confirms test-quality signals remain advisory and do not independently complete or block gates. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No consumer-repository test rewrite included. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No worker-cap or full-suite isolation remediation included. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No numeric CI/test/coverage target introduced. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-255ebb3fa64a | SC1, AC1, AC2, AC3, AC6, AC7 |  | C2, C4, C5, DONT4, DONT5 |  |
| tk-74d3c1500a26 | SC2, SC3, AC1, AC2, AC3, AC5, AC6, AC7 |  | C2, C4, C5, DONT4, DONT5 |  |
| tk-716f8d88d5dd | SC4, AC4 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
| tk-2cd5a44f7d5e |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3 |  |
