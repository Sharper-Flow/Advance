# Acceptance

Reviewed at: 2026-07-07T06:17:24.479Z

## Contract Review Matrix

| ID | Kind | Requirement | Status | Evidence |
|---|---|---|---|---|
| SC1 | success_criterion | Archived/terminal aggregate reads no longer fail as unclassified whole-tool `ToolExecutionTimeout` under bounded terminal-state fixtures. | pass | adv-reviewer report diagnoseArchivedListingTimeout2|change:review:acceptance|adv-reviewer|1 verdict READY; terminal degraded metadata verified. Tests tr_mra82g1b_9b62a08c, tr_mra8z3dr_853e9476, tr_mra91jl2_4312967b passed. |
| SC2 | success_criterion | Terminal archive/closed truth cannot be shadowed by stale active/draft projections. | pass | adv-reviewer READY; archive-first projection tests cover archive bundle dominance/stale shadow. Tests tr_mra732u3_ad1029a2 and full suite tr_mra91jl2_4312967b passed. |
| SC3 | success_criterion | Active-only/default change listing keeps existing fast-path behavior. | pass | adv-reviewer READY; active fast-path separation praised. Tests tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3 passed. |
| AC1 | acceptance_criterion | `adv_change_list` with archived/closed filters returns either complete rows or structured degraded output that names failed/omitted source classes. | pass | Implemented warnings/hydrationStats pass-through for adv_change_list. Store/tool tests tr_mra82g1b_9b62a08c passed; full suite tr_mra91jl2_4312967b passed. |
| AC2 | acceptance_criterion | Default active/in-flight `adv_change_list` excludes archived/closed terminal rows and does not run full terminal reconciliation when summary data is sufficient. | pass | Default/in-flight adv_change_list/listSummary active fast path tests passed in tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3. |
| AC3 | acceptance_criterion | When archive bundle and stale non-terminal projection disagree, terminal-aware reads return archived terminal state. | pass | Archive bundle dominance/stale non-terminal projection tests passed in tr_mra732u3_ad1029a2 and full suite tr_mra91jl2_4312967b. |
| AC4 | acceptance_criterion | Deterministic regression tests cover slow/unreachable terminal source, corrupt/missing archive candidate, stale projection dominance, and active-list no-regression. | pass | Deterministic tests cover visibility degradation, corrupt archive omission, stale projection dominance, canonical ID dedupe, and active-list no-regression. Evidence: tr_mra82g1b_9b62a08c, tr_mra8twd2_be2813a2, tr_mra8u9eq_ce68b2c3. |
| AC5 | acceptance_criterion | Broader workflow reset/status TTL/worktree cleanup work is explicitly deferred unless fixed through the shared terminal-list primitive. | pass | Review found no broad workflow reset/status TTL/worktree cleanup implementation; shared caller tests passed in tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3. |
| C1 | constraint | Do not weaken spec-law, gate sequencing, or archive correctness. | respected | Spec-law deltas added and cited; spec-citation/assets checks passed in tr_mra738ov_e573801b; reviewer verdict READY. |
| C2 | constraint | Do not treat stale disk projection as authoritative over reachable live workflow terminal state except through explicit terminal/recovery rules. | respected | Terminal projection path prefers archive/closed projections only via explicit terminal/recovery rules; reviewer verdict READY. |
| C3 | constraint | Do not hide partial/degraded reads as complete success. | respected | Partial/degraded terminal reads expose structured warnings and hydrationStats; tests tr_mra82g1b_9b62a08c passed; reviewer verdict READY. |
| C4 | constraint | Do not slow the active-only list path to fix archived/terminal paths. | respected | Active/default fast path remains on listSummary/memo/cache; tests tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3 passed. |
| C5 | constraint | Use deterministic tests or fakeable slow sources for timing-sensitive behavior; avoid flaky real-time p95 assertions. | respected | Tests use fake/call-count/source classification assertions; no wall-clock p95 budget added. Reviewer verdict READY. |
| DONT1 | avoidance | Do not raise the tool timeout as the fix. | respected | No timeout increase implemented; reviewer verdict READY. |
| DONT2 | avoidance | Do not replace Temporal or add a new external dependency. | respected | No new dependency or Temporal replacement; reviewer verdict READY and schemas/check/lint passed. |
| DONT3 | avoidance | Do not fold full workflow reset/disk-authoritative recovery from issue #198 into this change unless a small shared helper is directly required. | respected | No full workflow reset/disk-authoritative recovery added; change limited to shared terminal-list primitive and small typecheck repair. |
| DONT4 | avoidance | Do not implement the later status health TTL Epic entry here. | respected | No status health TTL Epic entry implemented; status hygiene tests only verify existing shared primitive caller behavior. |
| OOS1 | out_of_scope | Full Temporal storage architecture rewrite. | not_applicable | Full Temporal storage rewrite not part of implementation; reviewer verdict READY. |
| OOS2 | out_of_scope | Broad status-health TTL work outside the shared terminal-list primitive. | not_applicable | Broad status-health TTL deferred; no TTL implementation added. |
| OOS3 | out_of_scope | Unrelated worktree cleanup timeout behavior outside the shared terminal-list primitive. | not_applicable | Unrelated worktree cleanup timeout behavior not implemented. |

