# Contract Traceability

**Change ID:** fixTargetLifecycleRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-08T00:24:33.770Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| AC1 | acceptance_criterion | pass | test | change.test.ts target_path reentry test verifies getChangeHandle uses target-project-id and gates reset path; targeted suite tr_mrbby6eg_b4adb0a1 passed. |
| AC2 | acceptance_criterion | pass | test | change.test.ts target_path reentry test verifies fireSignalAndRefresh receives targetStore and response has _projectContext; tr_mrbby6eg_b4adb0a1 passed. |
| AC3 | acceptance_criterion | pass | test | change.test.ts unconfirmed target reentry test rejects before fireSignalAndRefresh; tr_mrbby6eg_b4adb0a1 passed. |
| AC4 | acceptance_criterion | pass | test | change.test.ts dryRun target reentry test verifies snapshot-ok/mutation:false and no getChangeHandle/fireSignalAndRefresh; tr_mrbby6eg_b4adb0a1 passed. |
| AC5 | acceptance_criterion | pass | test | adv-worktree.test.ts target_path resume test verifies initStateDb('/target') and no source-root materialization deps; tr_mrbby6eg_b4adb0a1 passed. |
| AC6 | acceptance_criterion | pass | test | adv-worktree.test.ts target_path resume test verifies advWorktreeResume receives projectRoot:'/target' and store:targetStore; tr_mrbby6eg_b4adb0a1 passed. |
| AC7 | acceptance_criterion | not_applicable | test | Design selected and implemented target-aware adv_worktree_resume, so the fallback hard-block path for intentionally not implementing target-aware resume is not applicable. |
| AC8 | acceptance_criterion | pass | test | Regression tests in change.test.ts and adv-worktree.test.ts prove source project IDs/roots are not used for target reenter/resume paths; tr_mrbby6eg_b4adb0a1 passed. |
| AC9 | acceptance_criterion | pass | test | Related scan PASS: reenter change.ts:4015; worktree resume adv-worktree.ts:606; delete :645; cleanup :689; gate complete gate.ts:1418; task update task.ts:907; task add :1185; cancel :1449; reclassify :1586; contract mint contract.ts:328 via withContractStore; subagent report submit subagent-report.ts:888. |
| AC10 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/change.test.ts src/tools/adv-worktree.test.ts src/tools/target-project.test.ts` passed in tr_mrbby6eg_b4adb0a1; reviewer rerun passed 145 tests. |
| AC11 | acceptance_criterion | pass | test | `pnpm run check` from plugin/ passed in tr_mrbbym91_37696677; reviewer rerun `pnpm --dir plugin run check` passed. |
| C1 | constraint | respected | static_check | Implementation derives project ID and worktree DB from active target store/root, not title/path heuristics. |
| C2 | constraint | respected | static_check | Both new target paths use withTargetPathStore; no parallel routing mechanism introduced. |
| C3 | constraint | respected | static_check | Unconfirmed target reentry regression passes; worktree resume routes through existing targetWorktreeMutationArgSchemas and withTargetPathStore trust helper. |
| C4 | constraint | respected | static_check | adv_change_reenter uses fireSignalAndRefresh(handle, activeStore, ...) and reviewer rg found no direct fireSignal(handle) matches in non-test tool files. |
| C5 | constraint | respected | static_check | No direct ADV state file reads/edits used; state interactions stay through store/tool helpers. |
| C6 | constraint | respected | static_check | Changes remain in tool/helper layers and tests; Temporal workflow code untouched. |
| C7 | constraint | respected | static_check | Tests use local mocks/fixtures in change.test.ts and adv-worktree.test.ts, not real PokeEdge projects. |
| C8 | constraint | respected | static_check | Verification used repo-local bin/oc-test for targeted suite; source-vs-deployed runtime boundary recorded in reviewer risk. |
| DONT1 | avoidance | respected | review | Target reentry tests assert target-project-id and targetStore; no source project ID routing for target mutation. |
| DONT2 | avoidance | respected | review | Target worktree resume test asserts target root/store deps; no source worktree namespace materialization. |
| DONT3 | avoidance | respected | review | Target confirmation guards remain exercised by tests and withTargetPathStore routing. |
| DONT4 | avoidance | respected | review | No product UX redesign or external placeholder cleanup performed. |
| DONT5 | avoidance | respected | review | No #92 code or issue work performed; #92 only used as triage evidence. |
| DONT6 | avoidance | respected | review | No disk projection/direct state reads/manual worktree path shuffling introduced. |
| DONT7 | avoidance | respected | review | No GitHub Project priority labels or roadmap scoring changed. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No existing PokeEdge placeholder changes or external repo worktrees cleaned up. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No broad cross-project UX or Epic membership semantics rework performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No new Temporal workflow primitive or coordinator workflow added. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No archive release-safety redesign performed beyond related-scan confirmation. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-0caf7d61355d | AC1, AC2, AC3, AC4, AC8 | AC1, AC2, AC3, AC4, AC8 | C1, C2, C3, C4, C5, C6, C7, DONT1, DONT3, DONT6 |  |
| tk-0b841e2e0149 | AC5, AC6, AC8 | AC5, AC6, AC7, AC8 | C1, C2, C3, C4, C5, C6, C7, C8, DONT2, DONT3, DONT4, DONT6 |  |
| tk-d721cb8f1189 |  | AC9 | C1, C2, C3, C4, C5, C6, DONT1, DONT3, DONT4, DONT6 |  |
| tk-8f6a1b2b8c57 |  | AC10, AC11, AC7 | C8, DONT5, DONT7, OOS1, OOS2, OOS3, OOS4 |  |
