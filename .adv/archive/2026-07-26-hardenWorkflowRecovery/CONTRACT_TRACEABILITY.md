# Contract Traceability

**Change ID:** hardenWorkflowRecovery
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-26T03:29:01.854Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Typed ChangeMutationCoordinator plus storage transaction implemented; saveChange allow-list mechanically inventories remaining exceptions. |
| SC2 | success_criterion | pass | review | Healthy coordinator tests prove typed Temporal signal/receipt/refresh and zero disk-recovery writes. |
| SC3 | success_criterion | pass | review | 100/100 disjoint concurrency tests survive; same-field conflicts return stale_revision. |
| SC4 | success_criterion | pass | review | Coordinator and gate readiness consume verified same-authority readback; recovered_unverified blocks. |
| SC5 | success_criterion | pass | review | Worker evolution guard, replay fixtures, candidate built-bundle verifier, and immutable negative evidence implemented. |
| SC6 | success_criterion | pass | review | Fault conformance, full suite, worker build, replay, and static checks pass. |
| AC1 | acceptance_criterion | pass | test | Coordinator healthy-path tests and migrated family tests; full suite tr_ms18n5x3_0fab3ced. |
| AC2 | acceptance_criterion | pass | test | Projection transaction + incident-pair tests pass 100/100; tr_ms0ybk43_725585ee and tr_ms11j9s6_a667efcc. |
| AC3 | acceptance_criterion | pass | test | Same-field race yields exactly one commit and one stale_revision; projection transaction tests. |
| AC4 | acceptance_criterion | pass | test | Readback mismatch returns unverified; gate readiness adapter and reviewer remediation tests tr_ms18ggwo_619a6797. |
| AC5 | acceptance_criterion | pass | test | Normalized fixtures cover SDK/wrapper/missing/completed/TMPRL1100/timeout/unknown including workflow-not-found. |
| AC6 | acceptance_criterion | pass | test | All named mutation families migrated or mechanically inventoried; save-change allow-list tests pass. |
| AC7 | acceptance_criterion | pass | test | Current worker build tr_ms17wiaq_190ee149 and candidate replay tr_ms17x0c6_f9ec67ed pass; immutable event-479 fixture fails as expected. |
| AC8 | acceptance_criterion | pass | test | Typed Worker Deployment readiness assessment covers all prerequisites and classifies singleton topology not-ready. |
| AC9 | acceptance_criterion | pass | test | Focused fault suites, remediation 98/98, post-review 78/78, and full suite tr_ms18n5x3_0fab3ced pass. |
| C1 | constraint | respected | static_check | Healthy path remains Temporal-authoritative; no disk-first downgrade. |
| C2 | constraint | respected | static_check | Recovery audit contains authority/evidence/revision; disk path is classified exception only. |
| C3 | constraint | respected | static_check | No agent/manual state-file procedure added; mutations use typed tools/coordinator. |
| C4 | constraint | respected | static_check | Worker Deployment routing remains disabled; readiness fails closed under singleton topology. |
| C5 | constraint | respected | static_check | Legacy revision 0, projections, archive bundles, and historical replay fixtures remain readable. |
| C6 | constraint | respected | static_check | Storage-owned lock/CAS, typed outcomes, postconditions, and static raw-write inventory own correctness. |
| DONT1 | avoidance | respected | review | Shared coordinator replaces per-tool bespoke recovery branching. |
| DONT2 | avoidance | respected | review | Atomic rename is paired with lock/latest-read/revision conditional commit. |
| DONT3 | avoidance | respected | review | save completion alone cannot return recovered_verified; readback required. |
| DONT4 | avoidance | respected | review | No Worker Deployment routing enabled. |
| DONT5 | avoidance | respected | review | No autonomous workflow reset/terminate/delete/close path introduced. |
| DONT6 | avoidance | respected | review | Tool-surface consolidation remains separate. |
| OOS1 | out_of_scope | missing | not_applicable |  |
| OOS2 | out_of_scope | missing | not_applicable |  |
| OOS3 | out_of_scope | missing | not_applicable |  |
| OOS4 | out_of_scope | missing | not_applicable |  |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-9148760f50d0 | SC3, AC2, AC3 | AC2, AC3 | C2, C3, C5, C6, DONT2, DONT3 |  |
| tk-7afb72be6c14 | SC1, SC2, SC4, AC1, AC4, AC5 | AC1, AC4, AC5 | C1, C2, C6, DONT1, DONT3, DONT5 |  |
| tk-4a7bc41e6500 | SC3, SC4, AC2, AC4, AC6 | AC2, AC4, AC6 | C1, C2, C3, C6, DONT1, DONT2, DONT3 |  |
| tk-b22a0d85b8bb | SC1, SC4, AC1, AC4, AC6 | AC1, AC4, AC6 | C1, C2, C3, C5, C6, DONT1, DONT3, DONT5 |  |
| tk-5013c8ed0b46 | SC5, AC7, AC8 | AC7, AC8 | C4, C5, C6, DONT4, DONT5 |  |
| tk-57647caf100c | SC6, AC9 | AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5, DONT6 |  |
