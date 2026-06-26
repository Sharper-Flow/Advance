# Contract Traceability

**Change ID:** fixEpicPlaceholders
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-26T05:22:38.302Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | tool-arg preflight regression matrix: blank create-time Epic fields normalize to omitted; combined targeted tests passed 191/191. |
| AC2 | acceptance_criterion | pass | test | tool-arg preflight regression matrix: sentinel create-time Epic fields normalize to omitted and partial real Epic membership is rejected before persistence; tests passed. |
| AC3 | acceptance_criterion | pass | test | Existing and preflight tests cover complete valid Epic create-time context and preserve compact epic_membership; tests passed. |
| AC4 | acceptance_criterion | pass | test | epic.test covers missing owner Epic dry-run clear and typed PROJECTION_MISMATCH refusal; combined targeted tests passed. |
| AC5 | acceptance_criterion | pass | test | bin/oc-test targeted -- src/utils/tool-arg-preflight.test.ts src/tools/change.test.ts src/tools/epic.test.ts passed: 191 tests. pnpm run typecheck passed. pnpm run format:check passed. |
| C1 | constraint | respected | static_check | Change preserves single optional epic_membership object; no schema/model expansion to multi-Epic membership. |
| C2 | constraint | respected | static_check | Missing-Epic repair fallback uses existing resolveChildStore target_path trust path; no target trust bypass added. |
| C3 | constraint | respected | static_check | All changes are source/test files in worktree; no ADV state files read or written directly. |
| C4 | constraint | respected | static_check | Preflight changes are limited to adv_change_create Epic fields and a cross-field validator; no broad preflight rewrite. |
| DONT1 | avoidance | respected | review | Blank/sentinel Epic fields normalize out before Zod/handler persistence; tests pass. |
| DONT2 | avoidance | respected | review | Missing-Epic clear refuses mismatched child projection with PROJECTION_MISMATCH; tests pass. |
| DONT3 | avoidance | respected | review | Valid complete create-time Epic membership test remains passing; no regression to intended membership. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-b12b54de8730 | AC1, AC2, AC3 | AC1, AC2, AC3 | C1, C2, C3, C4, DONT1, DONT3 |  |
| tk-c43418053a93 | AC1, AC2, AC3, AC5 | AC1, AC2, AC3, AC5 | C1, C2, C3, C4, DONT1, DONT3 |  |
| tk-f6a4c9daa602 | AC4, AC5 | AC4, AC5 | C1, C2, C3, C4, DONT2 |  |
