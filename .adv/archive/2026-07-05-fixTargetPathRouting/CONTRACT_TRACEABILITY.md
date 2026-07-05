# Contract Traceability

**Change ID:** fixTargetPathRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-05T15:59:23.304Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Target-path artifact readback implemented and re-verified after expanded scope; targeted tests `change.test.ts` + `cross-project-coordination.test.ts` passed 101 (tr_mr7ywe1g_43fb6530). |
| SC2 | success_criterion | pass | review | Target close/bulk-close route through target project workflows/store; acceptance rereview verdict READY with no blockers. |
| SC3 | success_criterion | pass | review | Implementation uses target store/query/signal paths; no workflow code changes; `pnpm run check` and `pnpm run build` passed. |
| SC4 | success_criterion | pass | review | Archive-finalization release tests restored; targeted git-finalize tests passed 82 (tr_mr7yw0b6_1a4dce46) and full suite passed (tr_mr7z02p3_1997709b). |
| AC1 | acceptance_criterion | pass | test | `plugin/src/tools/change.test.ts` regression tests verify target artifact documents returned and no-artifact target show remains snapshot-backed; targeted suite passed 101. |
| AC2 | acceptance_criterion | pass | test | Close target_path tests cover target project ID, target store `fireSignalAndRefresh`, dry-run read-only path, untrusted rejection, and recovery path. |
| AC3 | acceptance_criterion | pass | test | Bulk-close target_path tests cover target selection, project ID, target signal/cache refresh, disk sweep, untrusted rejection, and dry-run read-only path. |
| AC4 | acceptance_criterion | pass | test | Close and bulk-close target tests verify untrusted target mutation rejects before signal; reviewers found no blockers. |
| AC5 | acceptance_criterion | pass | test | Regression tests prove source project ID/store not used for target artifact readback, close, or bulk-close; targeted verification passed 101. |
| AC6 | acceptance_criterion | pass | test | Design KD2 records active target Temporal unreachable behavior: fail closed, no scaffold placeholder success; persisted before planning. |
| AC7 | acceptance_criterion | pass | test | `bin/oc-test targeted -- src/tools/archive-helpers/git-finalize.test.ts` passed 82 tests (tr_mr7yw0b6_1a4dce46). |
| AC8 | acceptance_criterion | pass | test | `bin/oc-test full` passed after archive-finalization repair (tr_mr7z02p3_1997709b). |
| C1 | constraint | respected | static_check | No target-path spec delta needed; change validates as conformance with expected NO_DELTAS warning only. |
| C2 | constraint | respected | static_check | No disk artifact write workaround introduced; target artifact readback reuses Temporal-first artifact helpers. |
| C3 | constraint | respected | static_check | Cache-refresh grep clean; change-scoped signals use `fireSignalAndRefresh` with owning/target store. |
| C4 | constraint | respected | static_check | Target mutations use shared target routing/confirmation; untrusted rejection tests pass. |
| C5 | constraint | respected | static_check | No Temporal workflow code changed; `pnpm run check` and `pnpm run build` passed. |
| C6 | constraint | respected | static_check | Tests use repo fixtures/temp dirs; no external PokeEdge dependency. |
| C7 | constraint | respected | static_check | `rq-releaseFinalization01.7` dirty-main checkpoint paths now continue as tests expect; git-finalize targeted tests passed 82. |
| C8 | constraint | respected | static_check | Unsafe-state blocker tests remain covered in git-finalize suite; no blocker logic relaxed; targeted git-finalize tests passed 82. |
| DONT1 | avoidance | respected | review | Review verified target close/bulk-close derive target project/store for handle, signal, recovery, cleanup, and selection. |
| DONT2 | avoidance | respected | review | No direct ADV state-file reads or disk artifact writes introduced. |
| DONT3 | avoidance | respected | review | Target confirmation behavior preserved; untrusted mutation tests pass. |
| DONT4 | avoidance | respected | review | No PokeEdge cleanup performed; scope stayed in Advance repo. |
| DONT5 | avoidance | respected | review | Target read expansion limited to `adv_change_show` artifact include paths; related-scan left non-artifact reads unchanged. |
| DONT6 | avoidance | respected | review | No new Temporal primitive/coordinator added; existing store/query/signal paths reused. |
| DONT7 | avoidance | respected | review | Did not weaken archive-finalization expectations; fixed default-branch detection so existing shipped/pending tests pass. |
| DONT8 | avoidance | respected | review | No git safety bypass; full suite failure was fixed and full suite now passes. |
| OOS1 | out_of_scope | not_applicable | not_applicable | External PokeEdge placeholder cleanup was out of scope and not performed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No product UX redesign performed. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Unrelated target-path surfaces not reworked. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Archive changes limited to default-branch detection repair and focused regression; no broad archive workflow redesign. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-5252a673fa19 | AC1, SC1 | AC1, AC5 | C2, C5, DONT2, DONT5, DONT6 |  |
| tk-d3bf9c1d667d | AC2, AC4, SC2 | AC2, AC4, AC5 | C3, C4, DONT1, DONT3, DONT6 |  |
| tk-81dfb52cf340 | AC3, AC4, SC2 | AC3, AC4, AC5 | C3, C4, DONT1, DONT3, DONT6 |  |
| tk-b0b0c45b04c9 |  | AC5, AC6, SC3 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, OOS1, OOS2, OOS3 |  |
| tk-85ad66127c64 | SC4, AC7 | AC7 | C7, C8, DONT7, DONT8, OOS4 |  |
| tk-99ff012686f5 |  | SC4, AC8, AC5 | C1, C3, C5, C6, C7, C8, DONT7, DONT8, OOS4 |  |
