# Contract Traceability

**Change ID:** diagnoseArchivedListingTimeout2
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-07T06:17:24.479Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | adv-reviewer report diagnoseArchivedListingTimeout2|change:review:acceptance|adv-reviewer|1 verdict READY; terminal degraded metadata verified. Tests tr_mra82g1b_9b62a08c, tr_mra8z3dr_853e9476, tr_mra91jl2_4312967b passed. |
| SC2 | success_criterion | pass | review | adv-reviewer READY; archive-first projection tests cover archive bundle dominance/stale shadow. Tests tr_mra732u3_ad1029a2 and full suite tr_mra91jl2_4312967b passed. |
| SC3 | success_criterion | pass | review | adv-reviewer READY; active fast-path separation praised. Tests tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3 passed. |
| AC1 | acceptance_criterion | pass | test | Implemented warnings/hydrationStats pass-through for adv_change_list. Store/tool tests tr_mra82g1b_9b62a08c passed; full suite tr_mra91jl2_4312967b passed. |
| AC2 | acceptance_criterion | pass | test | Default/in-flight adv_change_list/listSummary active fast path tests passed in tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3. |
| AC3 | acceptance_criterion | pass | test | Archive bundle dominance/stale non-terminal projection tests passed in tr_mra732u3_ad1029a2 and full suite tr_mra91jl2_4312967b. |
| AC4 | acceptance_criterion | pass | test | Deterministic tests cover visibility degradation, corrupt archive omission, stale projection dominance, canonical ID dedupe, and active-list no-regression. Evidence: tr_mra82g1b_9b62a08c, tr_mra8twd2_be2813a2, tr_mra8u9eq_ce68b2c3. |
| AC5 | acceptance_criterion | pass | test | Review found no broad workflow reset/status TTL/worktree cleanup implementation; shared caller tests passed in tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3. |
| C1 | constraint | respected | static_check | Spec-law deltas added and cited; spec-citation/assets checks passed in tr_mra738ov_e573801b; reviewer verdict READY. |
| C2 | constraint | respected | static_check | Terminal projection path prefers archive/closed projections only via explicit terminal/recovery rules; reviewer verdict READY. |
| C3 | constraint | respected | static_check | Partial/degraded terminal reads expose structured warnings and hydrationStats; tests tr_mra82g1b_9b62a08c passed; reviewer verdict READY. |
| C4 | constraint | respected | static_check | Active/default fast path remains on listSummary/memo/cache; tests tr_mra8twd2_be2813a2 and tr_mra8u9eq_ce68b2c3 passed. |
| C5 | constraint | respected | static_check | Tests use fake/call-count/source classification assertions; no wall-clock p95 budget added. Reviewer verdict READY. |
| DONT1 | avoidance | respected | review | No timeout increase implemented; reviewer verdict READY. |
| DONT2 | avoidance | respected | review | No new dependency or Temporal replacement; reviewer verdict READY and schemas/check/lint passed. |
| DONT3 | avoidance | respected | review | No full workflow reset/disk-authoritative recovery added; change limited to shared terminal-list primitive and small typecheck repair. |
| DONT4 | avoidance | respected | review | No status health TTL Epic entry implemented; status hygiene tests only verify existing shared primitive caller behavior. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Full Temporal storage rewrite not part of implementation; reviewer verdict READY. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Broad status-health TTL deferred; no TTL implementation added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Unrelated worktree cleanup timeout behavior not implemented. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-551addf7bb03 | SC1, SC2, SC3, AC1, AC2, AC3, AC5 | AC4 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, OOS1, OOS2, OOS3 |  |
| tk-fbc6a762e51a | SC2, SC3, AC2, AC3 | AC2, AC3, AC4 | C1, C2, C4, C5, DONT1, DONT2, DONT3, OOS1 |  |
| tk-17bdbbbce65b | SC1, AC1 | AC1, AC4 | C1, C3, C5, DONT1, DONT2, OOS1 |  |
| tk-efc86a513c07 | SC3, AC2, AC5 | AC2, AC4, AC5 | C4, C5, DONT3, DONT4, OOS2, OOS3 |  |
| tk-7023acf8a1e4 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4 | OOS1, OOS2, OOS3 |  |
