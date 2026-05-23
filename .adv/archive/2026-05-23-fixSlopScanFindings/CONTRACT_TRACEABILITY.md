# Contract Traceability

**Change ID:** fixSlopScanFindings
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Review trace: conformance.ts returns structured signalWarning for saved-success signal failures; conformance tests cover lock/override/run rejected signals. |
| SC2 | success_criterion | pass | review | Task tk-4b5c62e81eef persisted proof-backed resolution matrix in design; review accepted unresolved complexity items as non-blocking follow-up per ROADMAP #82 evidence. |
| SC3 | success_criterion | pass | review | Deletion/dependency dispositions backed by lgrep/source import checks, pnpm why, typecheck, focused tests, pnpm run check, and diff-check evidence in tk-24bef9c36e04. |
| SC4 | success_criterion | pass | review | plugin/src/tools/recovery-probe.ts centralizes workflowHasPoisonedRecoveryEvidence; call sites updated in change/contract/gate/task; recovery-probe tests cover poisoned markers and fallback paths. |
| SC5 | success_criterion | pass | review | tk-c4a9dffa0fa2 documents broad complexity findings as follow-up; implementation only touched correctness/deletion/recovery-adjacent paths. |
| AC1 | acceptance_criterion | pass | test | conformance.ts actionLock/actionOverride/actionRun include signalWarning in success responses after fireConformanceSignal warning; focused suite passed 214/214 this review. |
| AC2 | acceptance_criterion | pass | test | conformance.test.ts rejected-signal tests for lock, override, and run assert success:true, signalWarning, and persisted local state; focused suite passed 214/214. |
| AC3 | acceptance_criterion | pass | test | Resolution matrix persisted in design via adv_change_update during tk-4b5c62e81eef; ADV task evidence records slop catalog classification and proof method. |
| AC4 | acceptance_criterion | pass | test | Removed addTaskToChangeState/AddTaskInput, @temporalio/activity direct dep, and ambient SDK declaration only after source import checks plus typecheck, focused tests, pnpm run check, and pnpm install --frozen-lockfile evidence. |
| AC5 | acceptance_criterion | pass | test | workflowHasPoisonedRecoveryEvidence helper implemented and tested; exact affected tests passed during execution; focused suite rerun passed 214/214. |
| AC6 | acceptance_criterion | pass | test | Complexity findings documented as ROADMAP #82 follow-up; touched code limited to correctness/deletion/recovery; review found only suggestions/nits, no complexity blocker. |
| AC7 | acceptance_criterion | pass | test | Current review reran focused affected Vitest suite: 9 files, 214 tests passed. Current review reran pnpm run check: passed. |
| AC8 | acceptance_criterion | pass | test | tk-049e0eac4719 deterministic slop follow-up documented 126 non-blocking complexity-only findings tracked by ROADMAP #82; touched-scope pattern scan found no direct SDK import, addTaskToChangeState, @temporalio/activity import, or ambient SDK declaration. |
| C1 | constraint | respected | static_check | Review found workflow correctness, deletion safety, gate behavior, worktree isolation, and worker singleton unchanged; focused tests and pnpm run check passed. |
| C2 | constraint | respected | static_check | Conformance signal failure is now returned as signalWarning instead of debug-only logging; review found no correctness-sensitive failure hidden behind logs. |
| C3 | constraint | respected | static_check | Spec delta rq-confSignalVisibility01 added in .adv/specs and mirrored docs; implementation/tests align to spec scenarios. |
| C4 | constraint | respected | static_check | All verification commands run from plugin/ in worktree; Node/Vitest checks passed; no Bun-only runtime behavior added. |
| C5 | constraint | respected | static_check | No Temporal workflow code or defineUpdate surface changed; workflow-bundle-boundary test included in focused suite passed. |
| DONT1 | avoidance | respected | review | Deletion proof used source import checks, package-manager evidence, typecheck/check, and focused tests; no single-tool heuristic deletion accepted. |
| DONT2 | avoidance | respected | review | Review and state access used ADV tools; no ADV state files were read directly. |
| DONT3 | avoidance | respected | review | No defineUpdate reintroduction; workflow-bundle-boundary focused test passed; recovery helper remains tool-layer safe. |
| DONT4 | avoidance | respected | review | Broad complexity scan findings documented as follow-up; no blind repo-wide complexity refactor performed. |
| DONT5 | avoidance | respected | review | Change completed through approved prep task graph; no split/shrink based solely on breadth. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No new ADV user-facing features unrelated to slop findings were implemented. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No broad style rewrite or repo-wide churn; complexity-only work recorded as follow-up. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Conformance work limited to signal failure visibility; no external test-source implementation or policy redesign. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No protected registration/generated/test/fixture/example/command surface deleted without structural proof; deleted items were unused helper/ambient declaration/direct dependency. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4b5c62e81eef | SC2 | AC3 | DONT1, DONT2, OOS4, C1 |  |
| tk-7fa2d0d7bc2f | SC1, AC1, AC2 | AC1, AC2 | C1, C2, C3, OOS3 |  |
| tk-0aafd791df4e | SC4, AC5 | AC5 | C1, C5, DONT3 |  |
| tk-24bef9c36e04 | SC3, AC4 | AC4 | DONT1, OOS4, C1 |  |
| tk-c4a9dffa0fa2 | SC5 | AC6 | DONT4, DONT5, OOS2 |  |
| tk-049e0eac4719 |  | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4 |  |
