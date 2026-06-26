# Acceptance

Reviewed at: 2026-06-26T05:22:38.302Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | `adv_change_create` with blank optional `epic_id`, `entry_id`, and `epic_title` succeeds and creates a change with no `epic_membership`. | pass | tool-arg preflight regression matrix: blank create-time Epic fields normalize to omitted; combined targeted tests passed 191/191. |
| AC2 | acceptance_criterion | `adv_change_create` with known placeholder/sentinel Epic values does not create unintended `epic_membership`; it either normalizes them as omitted or rejects them with a typed `INVALID_TOOL_ARGS` response before persistence. | pass | tool-arg preflight regression matrix: sentinel create-time Epic fields normalize to omitted and partial real Epic membership is rejected before persistence; tests passed. |
| AC3 | acceptance_criterion | `adv_change_create` with complete, valid Epic create-time context still creates the intended compact `epic_membership` projection. | pass | Existing and preflight tests cover complete valid Epic create-time context and preserve compact epic_membership; tests passed. |
| AC4 | acceptance_criterion | `adv_epic_repair_membership mode: clear_stale_projection` can clear a matching child projection even when the owner Epic row is missing, requires audit evidence, and refuses mismatched projections. | pass | epic.test covers missing owner Epic dry-run clear and typed PROJECTION_MISMATCH refusal; combined targeted tests passed. |
| AC5 | acceptance_criterion | Targeted tests pass for the changed surfaces, including change-create and Epic repair tests. | pass | bin/oc-test targeted -- src/utils/tool-arg-preflight.test.ts src/tools/change.test.ts src/tools/epic.test.ts passed: 191 tests. pnpm run typecheck passed. pnpm run format:check passed. |
| C1 | constraint | Existing one-Epic-per-change invariant remains unchanged. | respected | Change preserves single optional epic_membership object; no schema/model expansion to multi-Epic membership. |
| C2 | constraint | Cross-project target-path trust rules remain intact. | respected | Missing-Epic repair fallback uses existing resolveChildStore target_path trust path; no target trust bypass added. |
| C3 | constraint | No direct ADV state file reads or writes. | respected | All changes are source/test files in worktree; no ADV state files read or written directly. |
| C4 | constraint | No broad rewrite of tool preflight beyond what is needed for this bug. | respected | Preflight changes are limited to adv_change_create Epic fields and a cross-field validator; no broad preflight rewrite. |
| DONT1 | avoidance | Do not silently create membership from blank, placeholder, or sentinel values. | respected | Blank/sentinel Epic fields normalize out before Zod/handler persistence; tests pass. |
| DONT2 | avoidance | Do not clear stale projections without exact expected `epic_id` and `entry_id` evidence. | respected | Missing-Epic clear refuses mismatched child projection with PROJECTION_MISMATCH; tests pass. |
| DONT3 | avoidance | Do not break valid create-time Epic membership. | respected | Valid complete create-time Epic membership test remains passing; no regression to intended membership. |

