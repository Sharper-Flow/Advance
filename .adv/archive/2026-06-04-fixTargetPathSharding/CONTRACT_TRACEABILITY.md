# Contract Traceability

**Change ID:** fixTargetPathSharding
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-04T19:52:43.582Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | src/tools/cross-project-coordination.test.ts sharded regression; bin/oc-test targeted -- src/utils/project-id.test.ts src/tools/target-project.test.ts src/tools/cross-project-coordination.test.ts passed 54 tests. |
| AC2 | acceptance_criterion | pass | test | src/tools/target-project.test.ts verifies withTargetPathStore snapshot-ok externalRoot exact target shard; show/list target_path use withOptionalTargetPathStore -> withTargetPathStore snapshot-ok. |
| AC3 | acceptance_criterion | pass | test | src/tools/target-project.test.ts verifies temporal-required target store externalRoot exact target shard and projectIdOverride target ID. |
| AC4 | acceptance_criterion | pass | test | src/utils/project-id.test.ts verifies non-sharded /custom/data fallback to /custom/data/opencode/plugins/advance/{targetProjectId}. |
| AC5 | acceptance_criterion | pass | test | Helper, fallback, target-store routing, and cross-project create tests included in 54-test targeted pass. |
| AC6 | acceptance_criterion | pass | test | Review of implementation: no copy/move/delete migration logic added; future target_path operations route canonical helper only. |
| AC7 | acceptance_criterion | pass | test | Passed: targeted tests 54, pnpm run format:check, pnpm run typecheck, pnpm run lint, spec JSON parse. |
| C1 | constraint | respected | static_check | Agent workflow used ADV tools for ADV state; implementation does not add direct ADV state file reads. |
| C2 | constraint | respected | static_check | getExternalRootForProject central helper plus unit tests; no scattered path string hacks. |
| C3 | constraint | respected | static_check | src/utils/project-id.test.ts non-sharded fallback test passes. |
| C4 | constraint | respected | static_check | Implementation did not modify workflow ID or getProjectId derivation; only external root helper added. |
| DONT1 | avoidance | respected | review | No migration/copy logic added; AC6 review evidence confirms shadow records not touched. |
| DONT2 | avoidance | respected | review | No shell wrapper or symlink workaround added; fix is TypeScript helper/store routing. |
| DONT3 | avoidance | respected | review | cross-project sharded regression asserts caller-shard target store does not contain created follow-up. |
| DONT4 | avoidance | respected | review | No changes to oc wrapper or OpenCode DB sharding policy; touched files are ADV plugin/spec/test files only. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-c021d721319d | AC6 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-d7a4c817b20e | AC4, AC5 | AC4, AC5 | C2, C3, C4, DONT2, DONT3 |  |
| tk-ea9efb72514d | AC2, AC3 | AC2, AC3, AC5 | C1, C2, C3, DONT2, DONT3 |  |
| tk-09e21cf2d2af | AC1, AC6 | AC1, AC5, AC6 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-f2cd592a14ef |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
