# Contract Traceability

**Change ID:** updateArchiveVisibilitySpec
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-11T17:21:34.112Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | git-finalize.test.ts 105 tests + archive-phase9.test.ts 34 tests cover all 6 finalization routes producing positive proof or actionable failure |
| SC2 | success_criterion | pass | review | archive-phase9.test.ts + archive-repair.test.ts 12 tests + status-repair.test.ts 15 tests confirm idempotent retry, no release-before-proof |
| SC3 | success_criterion | pass | review | workspace-warp.test.ts 47 tests + index-delete.test.ts 58 tests confirm fail-closed on uncertain ownership; no workspace or git removal without safety proof |
| SC4 | success_criterion | pass | review | ChangeContract minted (22 items strict); spec.json law body + docs/specs mirror + command/voice templates all enumerate five states; 318 regression tests green |
| AC1 | acceptance_criterion | pass | test | 6 new route×proof discriminant tests (git-finalize.test.ts): blocked/no_remote/pr_manual/merge_queue positive and negative proof paths; archive-phase9.test.ts covers direct/PR/blocked/conflict/deleted-branch |
| AC2 | acceptance_criterion | pass | test | archive-phase9.test.ts signal-timeout + terminal-timeout branches; archive-repair.test.ts bundle-present retry idempotence; status-repair.test.ts idempotent recovery — all pre-existing and confirmed green |
| AC3 | acceptance_criterion | pass | test | 3 new fail-closed tests: workspace cleanup failure 503 (retained), workspace lookup 503 (retained), workspace lookup throw (retained); git worktree remove never called |
| AC4 | acceptance_criterion | pass | test | Drain classification test: pending-delete record persists with lastErrorClass=workspace_ownership_uncertain; state.ts classifyPendingDelete maps typed classes; triage/status surfaces inherited |
| AC5 | acceptance_criterion | pass | test | workflow-noise-reduction-assets.test.ts five-state regex assertion on spec.json + docs/specs mirror; adv-autonomy-quality-assets.test.ts 33 tests verify command/voice template phrases |
| AC6 | acceptance_criterion | pass | test | archive-repair.test.ts 12 tests revalidate proof; status-repair.test.ts 15 tests; stale projection and missing metadata do not produce false success |
| AC7 | acceptance_criterion | pass | test | 318 deterministic regression tests across 8 files; pnpm run check green; DONT4 honored — no fabricated root cause |
| C1 | constraint | respected | static_check | ReleaseReachabilityProof remains sole typed authority; no production code changed in git-finalize.ts (OOS2); route×proof tests pin existing correct behavior |
| C2 | constraint | respected | static_check | Recovery tools unchanged; audit-gated recovery path preserved; no raw state-file mutation introduced |
| C3 | constraint | respected | static_check | cleanupOpenCodeWorkspaceForWorktree returns typed blocker on uncertainty; advWorktreeDelete never proceeds to git removal; pending-delete queue retains for manual retry |
| C4 | constraint | respected | static_check | All Git/GitHub I/O remains in tool/helper layers; workspace-warp.ts HTTP calls in utils; no workflow imports added; bundle-boundary tests green |
| C5 | constraint | respected | static_check | All implementation ran from ADV worktree change/updateArchiveVisibilitySpec; trunk stayed on default |
| DONT1 | avoidance | respected | review | No new retry loops or lifecycle concepts added; existing pending-delete drain reused |
| DONT2 | avoidance | respected | review | Workspace cleanup failures produce typed blockers; no error swallowing; no success downgrade |
| DONT3 | avoidance | respected | review | WORKSPACE_OWNERSHIP_UNCERTAIN and WORKSPACE_CLEANUP_FAILED both retain worktree; no removal without ownership proof |
| DONT4 | avoidance | respected | review | User-reported OpenCode error classified unverified in discovery; no fabricated root cause in implementation or tests |
| OOS1 | out_of_scope | not_applicable | not_applicable | No branch-protection, unrelated workflow, or external-project changes; no future-failure prevention claimed |
| OOS2 | out_of_scope | not_applicable | not_applicable | No git-finalize.ts refactor; only test additions to git-finalize.test.ts |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-f1f9465ad8b8 | AC1, AC2, AC6 | SC1, SC2, AC1, AC2, AC6 | C1, C2, C4, DONT1, DONT2, OOS2 |  |
| tk-5918decc9b8f | AC3, AC4 | SC3, AC3, AC4 | C3, DONT3 |  |
| tk-9bb515e3cfe3 | AC5 | SC4, AC5 | C1, DONT4 |  |
| tk-d8e859110e04 |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2 |  |
