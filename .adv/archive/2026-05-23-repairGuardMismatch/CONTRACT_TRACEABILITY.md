# Contract Traceability

**Change ID:** repairGuardMismatch
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | plugin/src/types/gates.ts classifies discovery as metadata; plugin/src/tools/gate.ts allows metadata gates before isolation guard; gate isolation tests cover discovery main-checkout allow. |
| AC2 | acceptance_criterion | pass | test | plugin/src/types/gates.ts classifies design as metadata; plugin/src/tools/gate.worktree-isolation.test.ts covers design main-checkout allow. |
| AC3 | acceptance_criterion | pass | test | plugin/src/types/gates.ts classifies planning/execution/acceptance/release as worktree_mutation; plugin/src/tools/gate.ts blocks guarded gates; task mutation guards remain in plugin/src/tools/task.ts. |
| AC4 | acceptance_criterion | pass | test | Remediation uses supported worktree resume/session routing; no unsupported adv_gate_complete workdir guidance found except tests asserting absence. |
| AC5 | acceptance_criterion | pass | test | plugin/src/tools/worktree/triage.ts recommends adv_worktree_resume; reviewer found no `adv_worktree_create --adopt`. |
| AC6 | acceptance_criterion | pass | test | plugin/src/tools/worktree/state.ts reads active worktree data through Temporal visibility and per-change workflow state; triage, file-overlap, branch-integration, and merge-order consume getWorktreeRegistrySnapshot with unavailable/warning handling. |
| AC7 | acceptance_criterion | pass | test | Regression coverage present in gate, worktree isolation, triage, registry snapshot, file-overlap, merge-order, and branch-integration tests; Vitest passed 229 files / 2990 tests. |
| C1 | constraint | respected | static_check | No bypass flag introduced; reviewer found branch integration force does not bypass integration gate. |
| C2 | constraint | respected | static_check | Metadata gates allowed selectively; worktree/git/task mutation gates remain guarded. |
| C3 | constraint | respected | static_check | Registry authority remains Temporal per-change workflow plus visibility; no sidecar authoritative SQLite/JSONL registry introduced. |
| C4 | constraint | respected | static_check | Structural enforcement via GATE_WORKTREE_IMPACT, shared guard adapter, spec update, and regression tests. |
| DONT1 | avoidance | respected | review | Reviewer found no `--ignore-isolation` usage in scoped implementation. |
| DONT2 | avoidance | respected | review | Remediation text avoids invalid adv_gate_complete/workdir argument guidance and points to supported worktree/session routing. |
| DONT3 | avoidance | respected | review | Temporal registry unavailable paths return explicit unavailable/warnings; triage no longer treats unavailable registry source as empty authoritative state. |
| DONT4 | avoidance | respected | review | Changes bounded to guard classification, registry reads, and triage recommendations; no broad cleanup deletion-policy rewrite. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-7b3ea7c0b053 | AC1, AC2, AC3, AC7 | AC1, AC2, AC3, AC7 | C1, C2, C4, DONT1 |  |
| tk-f37bc1b5c66b | AC1, AC2, AC3, AC4, AC7 | AC1, AC2, AC3, AC4, AC7 | C1, C2, C4, DONT1, DONT2 |  |
| tk-3f2f03278631 | AC6, AC7 | AC6, AC7 | C3, C4, DONT3 |  |
| tk-15b0075ef675 | AC5, AC6, AC7 | AC5, AC6, AC7 | C3, C4, DONT2, DONT3 |  |
| tk-aa1f38c92140 | AC6, AC7 | AC6, AC7 | C3, C4, DONT3, DONT4 |  |
| tk-b79f45cde614 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
