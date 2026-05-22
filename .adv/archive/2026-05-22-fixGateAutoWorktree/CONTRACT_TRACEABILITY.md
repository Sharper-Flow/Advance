# Contract Traceability

**Change ID:** fixGateAutoWorktree
**Contract Version:** 1
**Rigor:** minimal
**Reviewed:** 2026-05-22T03:02:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | Production adv_gate_complete wires auto-managed worktree resume deps via buildWorktreeAutoManageDeps in plugin/src/tools/gate.ts; verified by 4 completed tasks. |
| AC2 | acceptance_criterion | pass | test | Main checkout auto-managed violation returns WorktreeIsolationViolation with expectedWorktreePath; covered by gate.test.ts regression. |
| AC3 | acceptance_criterion | pass | test | target_path gate completion uses target store root via resolveTargetAwareMutationCwd; gate.test.ts asserts. |
| AC4 | acceptance_criterion | pass | test | task.ts uses resolveTargetAwareMutationCwd; task.test.ts asserts. |
| AC5 | acceptance_criterion | pass | test | proposal gate exempted via evaluateGateWorktreeIsolation early-return. |
| AC6 | acceptance_criterion | pass | test | gate completion from worktree allowed by isolation guard's session-context detection. |
| AC7 | acceptance_criterion | pass | test | Production-path regression covers adv_gate_complete.execute via gate.test.ts. |
| AC8 | acceptance_criterion | pass | test | Legacy aliases removed from createToolMap, ADV_TOOL_NAMES, allowlists; tool-registry.test.ts asserts. |
| AC9 | acceptance_criterion | pass | test | Verification recorded: targeted regression, pnpm run check, pnpm run build, full pnpm test all green at change completion. |
| AC10 | acceptance_criterion | pass | test | Worktree pending-delete fixture leak fixed as part of full-suite verification. |
| AC11 | acceptance_criterion | pass | test | Executive summary records rebuild/deploy/restart caveat. |
| C1 | constraint | respected | static_check | rq-worktreeMutationGuard01 + worktree-lifecycle spec semantics preserved. |
| C2 | constraint | respected | static_check | Main checkout non-proposal mutations remain blocked via WorktreeIsolationViolation. |
| C3 | constraint | respected | static_check | No symlink/env/deployed-artifact hacks; TS source + tests only. |
| C4 | constraint | respected | static_check | Scope stayed within gate/task wiring + alias cleanup. |
| C5 | constraint | respected | static_check | Verification ran from plugin/. |
| DONT1 | avoidance | respected | review | No worktree lifecycle policy change. |
| DONT2 | avoidance | respected | review | Defensive resumeRuntime-missing diagnostic preserved. |
| DONT3 | avoidance | respected | review | Duplicate worktree aliases removed; no compatibility aliases retained. |
| DONT4 | avoidance | respected | review | Scope unchanged beyond blocking full-suite stabilization. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-26a5fa9c7102 |  |  |  |  |
| tk-7ce177b4defa |  |  |  |  |
| tk-09482c0d9422 |  |  |  |  |
| tk-38fbce9d5136 |  |  |  |  |
