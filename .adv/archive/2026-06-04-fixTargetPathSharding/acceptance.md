# Acceptance

Reviewed at: 2026-06-04T19:52:43.582Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | From a sharded source session, `adv_change_create target_path:/target` writes the target change under the target project's canonical shard, not the caller shard. | pass | src/tools/cross-project-coordination.test.ts sharded regression; bin/oc-test targeted -- src/utils/project-id.test.ts src/tools/target-project.test.ts src/tools/cross-project-coordination.test.ts passed 54 tests. |
| AC2 | acceptance_criterion | `adv_change_show` and `adv_change_list` with `target_path:/target` read from the same canonical target shard used by creation. | pass | src/tools/target-project.test.ts verifies withTargetPathStore snapshot-ok externalRoot exact target shard; show/list target_path use withOptionalTargetPathStore -> withTargetPathStore snapshot-ok. |
| AC3 | acceptance_criterion | Existing mutation tools using `withTargetPathStore()` resolve target external roots through the target canonical shard under sharding. | pass | src/tools/target-project.test.ts verifies temporal-required target store externalRoot exact target shard and projectIdOverride target ID. |
| AC4 | acceptance_criterion | Non-sharded `$XDG_DATA_HOME/opencode/plugins/advance/{projectId}` behavior remains unchanged. | pass | src/utils/project-id.test.ts verifies non-sharded /custom/data fallback to /custom/data/opencode/plugins/advance/{targetProjectId}. |
| AC5 | acceptance_criterion | Tests cover sharded helper behavior, legacy fallback behavior, target-store routing, and cross-project create. | pass | Helper, fallback, target-store routing, and cross-project create tests included in 54-test targeted pass. |
| AC6 | acceptance_criterion | Existing shadow records, including `fixArchiveTimeout` under the pokeedge-web shard, are not automatically migrated. | pass | Review of implementation: no copy/move/delete migration logic added; future target_path operations route canonical helper only. |
| AC7 | acceptance_criterion | Targeted tests pass for edited helper/tool paths. | pass | Passed: targeted tests 54, pnpm run format:check, pnpm run typecheck, pnpm run lint, spec JSON parse. |
| C1 | constraint | Do not read ADV state files directly in agent workflow. | respected | Agent workflow used ADV tools for ADV state; implementation does not add direct ADV state file reads. |
| C2 | constraint | Keep correctness structural: explicit helper/tests for shard-aware path resolution, not ad hoc path concatenation at call sites. | respected | getExternalRootForProject central helper plus unit tests; no scattered path string hacks. |
| C3 | constraint | Do not break legacy non-sharded `XDG_DATA_HOME` deployments. | respected | src/utils/project-id.test.ts non-sharded fallback test passes. |
| C4 | constraint | Do not change Temporal workflow IDs or project ID derivation. | respected | Implementation did not modify workflow ID or getProjectId derivation; only external root helper added. |
| DONT1 | avoidance | No manual state copying between shards as primary fix. | respected | No migration/copy logic added; AC6 review evidence confirms shadow records not touched. |
| DONT2 | avoidance | No shell wrapper or symlink workaround. | respected | No shell wrapper or symlink workaround added; fix is TypeScript helper/store routing. |
| DONT3 | avoidance | No silent shadow write when target canonical shard can be derived. | respected | cross-project sharded regression asserts caller-shard target store does not contain created follow-up. |
| DONT4 | avoidance | No broad rework of OpenCode `oc` wrapper or per-project DB sharding. | respected | No changes to oc wrapper or OpenCode DB sharding policy; touched files are ADV plugin/spec/test files only. |

