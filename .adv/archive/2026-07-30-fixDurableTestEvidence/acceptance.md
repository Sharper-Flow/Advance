# Acceptance

Reviewed at: 2026-07-30T20:45:00.000Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Given a recorded `adv_run_test` result and a typed report citing its returned `runId` for the same change and task, when acceptance evaluates the task, then no `verification_missing` or `verification_mismatch` blocker is emitted for that entry. | pass | Gate-readiness tests prove valid typed-run entries do not emit verification_missing. |
| AC2 | acceptance_criterion | Given an earlier report for a task has invalid or missing typed test evidence, and a later report attempt cites a valid durable run for that same task, when acceptance evaluates the latest applicable report, then the earlier warning does not block acceptance. | pass | Latest-wins resolution test proves earlier invalid report no longer blocks when later valid report exists. |
| AC3 | acceptance_criterion | Given a report cites a run ID from a different change or task, or a missing/evicted run ID, when acceptance evaluates it, then acceptance remains blocked with an explicit identity or missing-evidence reason; it must not substitute another successful run. | pass | Cross-task and evicted run ID tests prove fail-closed identity checking. |
| AC4 | acceptance_criterion | Given a non-code task with an allowed non-test evidence policy, when it has the policy’s required evidence, then task completion and acceptance do not require `adv_run_test`, red/green phases, or a test-run ID. | pass | static_check with command/exit_code=0 proof no longer requires run ID; 114 gate-readiness tests pass. |
| AC5 | acceptance_criterion | Given a behavior-bearing code task using inline TDD, when its evidence is evaluated, then existing exact red/green and typed-run requirements remain enforceable; this change does not weaken them. | pass | Behavior-bearing code retains red/green enforcement; test policy unchanged. |
| AC6 | acceptance_criterion | Automated coverage includes the valid typed-run path and the earlier-invalid-then-later-valid regression path, plus at least one non-code evidence-policy path. | pass | Automated coverage includes valid typed-run, earlier-invalid-then-later-valid, and non-code static_check paths. |
| C1 | constraint | Evidence proof must be structurally correlated by `{changeId, taskId, runId}`. | respected | Evidence proof structurally correlated by {changeId, taskId, runId} for test; command/exit_code for static_check. |
| C2 | constraint | “Latest successful” never means an unrelated green run; it can only mean a later valid report/reference for the same task. | respected | Unrelated green runs cannot substitute; latest-wins only for same task. |
| C3 | constraint | No new dependencies. | respected | No new dependencies added. |
| C4 | constraint | No widening of `adv_run_test` or TDD requirements. | respected | adv_run_test and TDD requirements not widened; existing red/green preserved. |
| C5 | constraint | Retention loss remains explicit and auditable; no silent fallback. | respected | Retention loss explicit and auditable; no silent fallback. |
| OOS1 | out_of_scope | Removing verification from behavior-bearing code. | not_applicable | No verification removed from behavior-bearing code. |
| OOS2 | out_of_scope | Making acceptance permissive through manual state edits or warning suppression. | not_applicable | No permissive manual state edits or warning suppression. |
| OOS3 | out_of_scope | Replacing evidence policies with a one-size-fits-all testing rule. | not_applicable | No one-size-fits-all testing rule. |

