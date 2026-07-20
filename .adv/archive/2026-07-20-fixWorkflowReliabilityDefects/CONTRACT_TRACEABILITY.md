# Contract Traceability

**Change ID:** fixWorkflowReliabilityDefects
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-20T00:05:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Nine linked issues have closure evidence; eight tasks done; review defect fixed at 307f4d47. |
| SC2 | success_criterion | pass | review | Typed structural authorities cover session, report, run, receipt, replay, and validator behavior. |
| SC3 | success_criterion | pass | review | Valid paths recovered without bypass; unsafe/incomplete evidence remains fail-closed with typed diagnostics. |
| SC4 | success_criterion | pass | review | Legacy variants, additive schemas, and replay fixtures passed tr_mrsgjl5y_9d79db59. |
| SC5 | success_criterion | pass | review | Full suite tr_mrsgjl5y_9d79db59, check tr_mrsgbrar_8f21a9d9, build tr_mrsgk6le_73f3ac45 passed. |
| AC1 | acceptance_criterion | pass | test | 35462b52; firewall/integration tests cover root, descendant, missing, cyclic, malformed, unavailable ancestry. |
| AC2 | acceptance_criterion | pass | test | 35462b52 + 307f4d47; tr_mrsgavwh_078d6696 passed 15 WIP orphan/privacy tests. |
| AC3 | acceptance_criterion | pass | test | f9424e69; one cancellation-aware projection keeps respects separate and returns uncovered IDs. |
| AC4 | acceptance_criterion | pass | test | d626cf61; bounded nested preflight diagnostics occur before handler/signal/write. |
| AC5 | acceptance_criterion | pass | test | f9424e69; stage-v2 prep rationale/proof target and completion reviewer reference tests pass. |
| AC6 | acceptance_criterion | pass | test | 76eaad8d; typed-v1 same-task run/exit binding and explicit legacy fallback tests pass. |
| AC7 | acceptance_criterion | pass | test | b5e8fec9; exact post-apply receipt and typed unconfirmed-failure tests pass. |
| AC8 | acceptance_criterion | pass | test | addArchiveScaleRegression proves 250 terminal/50 active under 8,000ms, zero terminal reads, fail-closed omissions; #239 evidence comment recorded. |
| AC9 | acceptance_criterion | pass | test | d5b0d53c; 250 owners + poisoned workflow regression returns healthy and explicit omitted/poison records safely. |
| AC10 | acceptance_criterion | pass | test | tr_mrsgbrar_8f21a9d9 passed schemas/typecheck/manifests/lint/format; full suite passed legacy reads. |
| AC11 | acceptance_criterion | pass | test | Issues #224/#239/#240/#241/#243/#244/#245/#246/#247 each received relevant checkpoint, regression, and final-verification evidence. |
| AC12 | acceptance_criterion | pass | test | 7e7c8662; known PokeEdge changes queryable after deploy/restart, staleRunningCount=0, bounded 50-change scan found no additional poison candidate. |
| AC13 | acceptance_criterion | pass | test | d626cf61; validator blockers require approved contract IDs, in-scope remediation, source; fail status advisory. |
| C1 | constraint | respected | static_check | Role and gate enforcement remain fail-closed. |
| C2 | constraint | respected | static_check | Peer PID/full workdir omitted; warning rows use privacy-safe IDs. |
| C3 | constraint | respected | static_check | Temporal ordering/determinism/replay fixtures pass; persistence remains Temporal-backed. |
| C4 | constraint | respected | static_check | Schema evolution additive with explicit deterministic legacy variants. |
| C5 | constraint | respected | static_check | Archive authority budget remains fixed at 8,000ms. |
| C6 | constraint | respected | static_check | addArchiveScaleRegression retains #239 ownership; no duplicate inventory authority. |
| C7 | constraint | respected | static_check | #239/#224 use production-shaped regression evidence; no destructive live mutation required. |
| C8 | constraint | respected | static_check | No PokeEdge product-code edit; only Advance worker compatibility and read-only checks. |
| DONT1 | avoidance | respected | review | No restriction weakening or caller role authority. |
| DONT2 | avoidance | respected | review | No automatic orphan reset/complete/cancel/reassign. |
| DONT3 | avoidance | respected | review | Respects never covers success/acceptance criteria. |
| DONT4 | avoidance | respected | review | Typed run identity owns new evidence; prose/display labels non-authoritative. |
| DONT5 | avoidance | respected | review | Receipts and complete authority own correctness; retries/cache/partial lists do not. |
| DONT6 | avoidance | respected | review | Existing archive/worktree authorities extended, not duplicated. |
| DONT7 | avoidance | respected | review | No reset, termination, status repair, or archive bypass of product gates. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |
| OOS5 | out_of_scope | missing | not_applicable |  |
| OOS6 | out_of_scope | missing | not_applicable |  |
| OOS7 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-4d88352a1bae | AC1, AC2, SC2, SC3 | AC1, AC2 | C1, C2, DONT1, DONT2, OOS3, OOS4 |  |
| tk-7e1b22e1e352 | AC3, AC5, SC2, SC3, SC4 | AC3, AC5 | C3, C4, DONT3, DONT4, OOS2 |  |
| tk-c669fa079bbe | AC4, AC13, SC2, SC3, AC10 | AC4, AC13 | C1, C4, DONT5, OOS5, OOS6 |  |
| tk-d90aefa06f2c | AC6, AC10, SC2, SC4 | AC6, AC10 | C4, DONT4, OOS5 |  |
| tk-afbc111de8e8 | AC7, SC2, SC3 | AC7 | C1, C3, C4, DONT5, OOS3 |  |
| tk-470701bcb632 | AC12, SC2, SC3, SC4 | AC12 | C3, C8, DONT7, OOS2, OOS7 |  |
| tk-1c276faf0b7b | AC8, AC9, SC1, SC3 | AC8, AC9 | C5, C6, C7, DONT6 |  |
| tk-ed0bbe850cd7 | AC11, SC1, SC5 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13, SC1, SC2, SC3, SC4, SC5 | C1, C2, C3, C4, C5, C6, C7, C8, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6, DONT7, OOS1, OOS2, OOS3, OOS4, OOS5, OOS6, OOS7 |  |
