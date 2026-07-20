# Contract Traceability

**Change ID:** addLightweightChangeProfile
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-16T21:40:27.415Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance re-review READY; typed profile preserves gate authority. |
| SC2 | success_criterion | pass | review | Typed evaluation history, boundary revalidation, and stable keys reviewed. |
| SC3 | success_criterion | pass | review | Downgrade tests and review confirm standard routing/no bypass. |
| AC1 | acceptance_criterion | pass | test | Focused profile suites pass; six criteria schema asserted. |
| AC2 | acceptance_criterion | pass | test | Fail-closed unknown/malformed/incomplete-range tests pass. |
| AC3 | acceptance_criterion | pass | test | Collector tests cover multi-commit, rename, delete, untracked paths. |
| AC4 | acceptance_criterion | pass | test | Boundary policy and failure-downgrade tests pass. |
| AC5 | acceptance_criterion | pass | test | Exact four-category omission policy tests pass. |
| AC6 | acceptance_criterion | pass | test | Required-control and explicit-delegation precedence tests pass. |
| AC7 | acceptance_criterion | pass | test | No-reset downgrade behavior is tested and reviewed. |
| AC8 | acceptance_criterion | pass | test | 94 focused acceptance re-review tests pass. |
| C1 | constraint | respected | static_check | Zod schemas and durable state own eligibility. |
| C2 | constraint | respected | static_check | Reviewer found no competing workflow state machine. |
| C3 | constraint | respected | static_check | Unknown, policy, Git, and boundary failures fail closed. |
| C4 | constraint | respected | static_check | Review confirms required controls remain intact. |
| C5 | constraint | respected | static_check | Complete-range evidence covers Git and worktree states. |
| DONT1 | avoidance | respected | review | Only immutable four-item omission policy exists. |
| DONT2 | avoidance | respected | review | No review or verification blocker disposal added. |
| DONT3 | avoidance | respected | review | Central evaluator and gate routing own decisions. |
| DONT4 | avoidance | respected | review | Read/evaluation failures cause non-qualification, never authorization. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No gate removal or reordering. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Standard workflow unchanged for ineligible changes. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No cross-project profile behavior. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No general status/read latency optimization. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-2523227ec38d | SC1, SC2, AC1, AC2 |  | C1, C2, C3, DONT1, DONT3, DONT4 |  |
| tk-2d8c3e7ce0d9 | AC1, AC2, AC3, AC8 |  | C1, C3, C5, DONT4 |  |
| tk-731a12c746f6 | SC1, SC2, SC3, AC4, AC5, AC6, AC7 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-f684eeba0a35 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 |  |
