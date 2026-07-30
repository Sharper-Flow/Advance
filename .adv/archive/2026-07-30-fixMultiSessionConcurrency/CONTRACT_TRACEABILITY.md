# Contract Traceability

**Change ID:** fixMultiSessionConcurrency
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-30T06:15:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Historical 12-agent same-project peak and corrected per-project interval evidence; resource limits stated without synthetic latency claim. |
| SC2 | success_criterion | pass | review | Runtime, status, ADR, specs, and generated assets use one resolved policy. |
| SC3 | success_criterion | pass | review | Target guards and trunk operations gates implemented/review READY. |
| SC4 | success_criterion | pass | review | Backend/frontend resource isolation implementations review READY. |
| SC5 | success_criterion | pass | review | Archive local sync remains non-authoritative to remote release proof. |
| SC6 | success_criterion | pass | review | Target freshness wrappers enforce shared 60-second suppression. |
| AC1 | acceptance_criterion | pass | test | Default per-session routing and explicit singleton compatibility regression matrix passes. |
| AC2 | acceptance_criterion | pass | test | Status/runtime omitted, explicit, invalid policy parity tests pass. |
| AC3 | acceptance_criterion | pass | test | Collector partitions verified intervals per project, unknown roles separate, historical 12/6 separately sourced; 16 tests pass. |
| AC4 | acceptance_criterion | pass | test | 204 archive helper/Phase 9 tests prove dirty/diverged/wrong-branch no mutation and remote proof authority. |
| AC5 | acceptance_criterion | pass | test | Backend/frontend implementations enable guards and canonical ops gates; target reviews READY and matrices 17/17. |
| AC6 | acceptance_criterion | pass | test | Bounded lock retry deterministic tests pass; BRANCH_LOCKED retains structured exhaustion. |
| AC7 | acceptance_criterion | pass | test | Target bootstrap/resource isolation execution done and reviews READY. |
| AC8 | acceptance_criterion | pass | test | Both target wrappers set TTL 60; trigger routing implemented. |
| AC9 | acceptance_criterion | pass | test | One effective-value matrix binds runtime and diagnostics. |
| AC10 | acceptance_criterion | pass | test | Current specs reconcile per-session default and conditional singleton; generated checks pass. |
| C1 | constraint | respected | static_check | No synthetic ten-session load test run. |
| C2 | constraint | respected | static_check | Three independently tracked changes created; target terminal release follows Advance deployment per approved reentry. |
| C3 | constraint | respected | static_check | Dirty trunk work preserved local-only or removed only with explicit approval. |
| C4 | constraint | respected | static_check | Temporal workflow contracts/signals and workflow import boundaries unchanged. |
| C5 | constraint | respected | static_check | Explicit singleton compatibility retained with safe pinned-queue refusal. |
| C6 | constraint | respected | static_check | Remote/default reachability remains release authority. |
| C7 | constraint | respected | static_check | No deployment/rebuild/install/release executed from worktrees. |
| DONT1 | avoidance | respected | review | All feature readers consolidated, not one-line patched. |
| DONT2 | avoidance | respected | review | Status consumes same typed policy as runtime. |
| DONT3 | avoidance | respected | review | Uncallable command prose removed; executable handler seam added. |
| DONT4 | avoidance | respected | review | No internal git-finalize caller added. |
| DONT5 | avoidance | respected | review | Local divergence never becomes release failure. |
| DONT6 | avoidance | respected | review | No deployment branch or operations worktree introduced. |
| DONT7 | avoidance | respected | review | Cleanup, lease, and terminal proof authority preserved. |
| DONT8 | avoidance | respected | review | No polling loop or freshness daemon added. |
| DONT9 | avoidance | respected | review | No bulk worktree/branch deletion in current change. |
| DONT10 | avoidance | respected | review | No target CI or merge-order automation redesign. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No Temporal workflow contract/signal redesign. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No worktree flock/lease/cleanup authority redesign. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Fleet migration tracked as migrateExistingAdvWorktrees. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No CI redesign. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No cross-repo merge automation. |
| OOS6 | out_of_scope | not_applicable | not_applicable | No production deployment execution in release gate. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-63fe92cb7981 | AC6 | AC6 | DONT7, OOS2 |  |
| tk-7eb993c8760e | SC1, SC2, AC1, AC2, AC9, AC10, C4, C5 | AC1, AC2, AC9, AC10 | DONT1, DONT2, OOS1 |  |
| tk-1ade560551eb | SC5, AC4, C6 | AC4 | DONT3, DONT4, DONT5, DONT7, OOS2 |  |
| tk-5563998899c6 | SC1, AC3, C1 | AC3 | DONT8, OOS1 |  |
| tk-652bbe840249 | SC2, AC10 | AC2, AC10 | C4, C5, DONT1, DONT2, OOS1 |  |
| tk-a31d455ed82e |  | SC3, SC4, SC6, AC5, AC7, AC8 | C2, C3, C7, DONT6, DONT8, DONT9, DONT10, OOS3, OOS4, OOS5, OOS6 |  |
