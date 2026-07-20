# Contract Traceability

**Change ID:** fixScopeRepoFixture
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-07-20T16:35:07.220Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | RED/GREEN detector tr_mrtfktp9_e1b3167c → tr_mrtflc18_ac83e9c; diff replaces all seven affected non-hex fixture/expectation values. |
| AC2 | acceptance_criterion | pass | test | adv_run_test tr_mrtfnokv_c602968f: portable loop completed 10 consecutive targeted runs with exit 0. |
| AC3 | acceptance_criterion | pass | test | adv_run_test tr_mrtfo681_46b8faee: TypeScript typecheck and Prettier check passed. |
| AC4 | acceptance_criterion | pass | test | PR #262 CI terminal success: 6/6 checks passed; mergeable=CLEAN. |
| C1 | constraint | respected | static_check | Git diff for 1328c5c2 changes only fixture/expected string values in cross-project-coordination.test.ts; production code untouched. |
| C2 | constraint | respected | static_check | Implementation occurred only in ADV-owned change worktree; unrelated dirty trunk .adv/backlog.jsonl and AGENTS.md untouched. |
| DONT1 | avoidance | respected | review | Reviewer report fixScopeRepoFixture|tk-fc4b64c47349|adv-reviewer|1: assertions unchanged; READY, zero findings. |
| DONT2 | avoidance | respected | review | Reviewer report confirms no test quarantine or skip changes. |
| DONT3 | avoidance | respected | review | Reviewer report confirms no retry logic or masking behavior added. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-fc4b64c47349 | AC1 | AC2, AC3, AC4 | C1, C2, DONT1, DONT2, DONT3 |  |
