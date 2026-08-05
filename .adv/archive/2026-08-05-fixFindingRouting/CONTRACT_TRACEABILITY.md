# Contract Traceability

**Change ID:** fixFindingRouting
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-08-05T04:36:00.000Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Asset tests verify Finding Routing claims in apply/review/harden command files fail on removal (finding-routing-assets.test.ts, tr_msfikqxm GREEN 4/4). |
| SC2 | success_criterion | pass | review | checkRespectsEvidenceAuthority gate-readiness test (tr_msfksogj 11/11) confirms respects on DONT/OOS without review authority fails; with task-scoped report passes. |
| SC3 | success_criterion | pass | review | portfolio-state.test.ts (tr_msfjua0y 8/8) verifies bounded stats + {available:false} degradation + nudge thresholds. |
| SC4 | success_criterion | pass | review | 4 spec deltas staged via adv_delta_add (rq-findingRouting01, rq-respectsEvaluation01, rq-createPortfolioLine01, rq-retryProgressAccounting01); schemas/manifests green (tr_msfl4b18, tr_msfl3mdh). |
| SC5 | success_criterion | pass | review | change-state.test.ts progress-vs-retry (tr_msfj6vb0 109/109) + budget warning tests verify honest retry accounting; loop-ledger consistency confirmed. |
| AC1 | acceptance_criterion | pass | test | T1 tk-5a18730016a5: prep MoSCoW Won't routes to adv_backlog_add; asset test GREEN (tr_msfjdjfr 6/6). |
| AC2 | acceptance_criterion | pass | test | T1 tk-5a18730016a5: design risk-table reframed for durable-record; asset test GREEN. |
| AC3 | acceptance_criterion | pass | test | T6 tk-0f9abb0a1843: checkRespectsEvidenceAuthority 11/11 tests (tr_msfksogj); RED tr_msfkrf4l → GREEN. |
| AC4 | acceptance_criterion | pass | test | T3 tk-db22a5e28980: portfolioState 8/8 tests (tr_msfjua0y); typecheck clean; degradation marker explicit. |
| AC5 | acceptance_criterion | pass | test | T1+T2: finding-routing-assets.test.ts 6/6 (tr_msfl3l8a); drift-guard anchors in prep/design/apply/review/harden. |
| AC6 | acceptance_criterion | pass | test | T4 tk-e5b7b138c45b: progress-vs-retry discrimination RED→GREEN (tr_msfj6vb0 109/109 change-state); disjoint findings=progress. |
| AC7 | acceptance_criterion | pass | test | T5 tk-fb7e557948b3: budget_warning RED→GREEN (tr_msfkaz0t 21/21); submission never refuses at/over budget. |
| C1 | constraint | respected | static_check | checkRespectsEvidenceAuthority applies to all done tasks (no grandfathering); typecheck confirms cross-policy authority rule. |
| C2 | constraint | respected | static_check | Portfolio read deadline-capped (2s, PORTFOLIO_READ_DEADLINE_MS); degrades to {available:false}; never blocks creation. |
| C3 | constraint | respected | static_check | All changes are structural (Zod schemas, gate checks, typed blockers) not prose rules; typecheck clean. |
| C4 | constraint | respected | static_check | Progress rounds do not inflate error_recovery (T4 test: retry_count stays 1 after 4 disjoint rounds); budget_warning is non-refusing (T5 test). |
| C5 | constraint | respected | static_check | All new schema fields (budget_warning, progress_rounds, portfolioState, ChangePortfolioState) are Zod-optional; backward compatible. |
| C6 | constraint | respected | static_check | Spec deltas consistent with implementation; rq IDs match code behavior; CHANGELOG entries reference specific mechanisms. |
| C7 | constraint | respected | static_check | Loop-ledger consistency: progress_rounds tracked separately from error_recovery; rq-loopLedger01 severity derivation unchanged. |
| DONT1 | avoidance | respected | review | No reflexive change creation: findings route to adv_backlog_add (T1/T2 command contracts); portfolioState nudge names backlog (T3). Verified by adv-reviewer task-scoped reports. |
| DONT2 | avoidance | respected | review | No mandatory prose friction: routing claims are one-line directives, not justification gates. Verified by adv-reviewer. |
| DONT3 | avoidance | respected | review | Phase-plan read projections are non-authorizing; checkRespectsEvidenceAuthority is a structural gate check, not a directive override. |
| DONT4 | avoidance | respected | review | Progress rounds recorded in progress_rounds[], NOT error_recovery.attempts; budget_warning is a marker, not an error_recovery inflation. T4/T5 tests confirm. |
| DONT5 | avoidance | respected | review | Report submission never refuses at/over budget (T5 test: 4th attempt applies without throw); clamp emits warning, not block. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Portfolio state is read-only; no mutation of portfolio or backlog state. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Completed tasks' recorded evidence accepted not relitigated: checkRespectsEvidenceAuthority checks for existence, not re-examination. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No tool-call audit log implemented; respects check uses sub-agent report authority, not call tracing. |
| OOS4 | out_of_scope | not_applicable | not_applicable | Out of scope. |
| OOS5 | out_of_scope | not_applicable | not_applicable | Out of scope. |
| OOS6 | out_of_scope | not_applicable | not_applicable | Out of scope. |
| OOS7 | out_of_scope | not_applicable | not_applicable | No budget_warning on submitFailureRecovery (single-failure path, not budget clamp). |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9d5613c99473 | AC5 | SC1 | DONT1, DONT2, C2, C5 |  |
| tk-e5b7b138c45b | AC6 | SC5 | C4, C7, DONT4, DONT5, OOS7 |  |
| tk-5a18730016a5 | AC1, AC2, AC5 |  | DONT1, DONT2, C2, C5 |  |
| tk-db22a5e28980 | AC4 | SC3 | C2, DONT2, OOS1 |  |
| tk-fb7e557948b3 | AC7 | SC5 | C4, DONT4, DONT5 |  |
| tk-0f9abb0a1843 | AC3 | SC2 | C1, C5, DONT1, OOS2, OOS3 |  |
| tk-2e74012d767d |  | SC4 | C6, C5 |  |
