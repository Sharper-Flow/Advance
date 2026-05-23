# Acceptance

Reviewed at: 

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| AC1 | acceptance_criterion | Discovery gate completion from main checkout succeeds when it only records discovery state and does not mutate repo/git. | pass | plugin/src/types/gates.ts classifies discovery as metadata; plugin/src/tools/gate.ts allows metadata gates before isolation guard; gate isolation tests cover discovery main-checkout allow. |
| AC2 | acceptance_criterion | Design gate metadata completion from main checkout succeeds when it does not mutate repo/git. | pass | plugin/src/types/gates.ts classifies design as metadata; plugin/src/tools/gate.worktree-isolation.test.ts covers design main-checkout allow. |
| AC3 | acceptance_criterion | Planning, execution, acceptance, release, and task execution mutations still block from main checkout under active isolation/auto-managed changes. | pass | plugin/src/types/gates.ts classifies planning/execution/acceptance/release as worktree_mutation; plugin/src/tools/gate.ts blocks guarded gates; task mutation guards remain in plugin/src/tools/task.ts. |
| AC4 | acceptance_criterion | Worktree isolation remediation for `adv_gate_complete` contains no unsupported `workdir` argument and points to supported session/worktree routing. | pass | Remediation uses supported worktree resume/session routing; no unsupported adv_gate_complete workdir guidance found except tests asserting absence. |
| AC5 | acceptance_criterion | `adv_worktree_triage` emits no `adv_worktree_create --adopt` recommendation. | pass | plugin/src/tools/worktree/triage.ts recommends adv_worktree_resume; reviewer found no `adv_worktree_create --adopt`. |
| AC6 | acceptance_criterion | Triage, file-overlap, branch-integration, and merge-order registry reads use authoritative Temporal per-change worktree records or explicit unavailable/warning results, not retired/stubbed empty paths. | pass | plugin/src/tools/worktree/state.ts reads active worktree data through Temporal visibility and per-change workflow state; triage, file-overlap, branch-integration, and merge-order consume getWorktreeRegistrySnapshot with unavailable/warning handling. |
| AC7 | acceptance_criterion | Regression tests cover the classification table, remediation text, triage recommendation, and same-pattern registry consumers. | pass | Regression coverage present in gate, worktree isolation, triage, registry snapshot, file-overlap, merge-order, and branch-integration tests; Vitest passed 229 files / 2990 tests. |
| C1 | constraint | Do not add bypass flags. | respected | No bypass flag introduced; reviewer found branch integration force does not bypass integration gate. |
| C2 | constraint | Do not weaken code/git-mutating isolation. | respected | Metadata gates allowed selectively; worktree/git/task mutation gates remain guarded. |
| C3 | constraint | Do not restore sidecar SQLite/JSONL as authoritative registry state. | respected | Registry authority remains Temporal per-change workflow plus visibility; no sidecar authoritative SQLite/JSONL registry introduced. |
| C4 | constraint | Keep solution structurally enforced through spec, types/adapters, and tests. | respected | Structural enforcement via GATE_WORKTREE_IMPACT, shared guard adapter, spec update, and regression tests. |
| DONT1 | avoidance | No `--ignore-isolation`. | respected | Reviewer found no `--ignore-isolation` usage in scoped implementation. |
| DONT2 | avoidance | No invalid remediation flags/arguments. | respected | Remediation text avoids invalid adv_gate_complete/workdir argument guidance and points to supported worktree/session routing. |
| DONT3 | avoidance | No false orphan reports from unavailable registry source. | respected | Temporal registry unavailable paths return explicit unavailable/warnings; triage no longer treats unavailable registry source as empty authoritative state. |
| DONT4 | avoidance | No broad cleanup deletion-policy rewrite. | respected | Changes bounded to guard classification, registry reads, and triage recommendations; no broad cleanup deletion-policy rewrite. |

