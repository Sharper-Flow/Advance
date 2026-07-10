# Contract Traceability

**Change ID:** addLoopLedger
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-10T15:59:10.171Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance reviewer READY; loop-ledger projector/readback tests cover source-backed history. |
| SC2 | success_criterion | pass | review | Projector tests cover pass, fail, blocked, and inconclusive verdict vocabulary. |
| SC3 | success_criterion | pass | review | change.test verifies compact _loopLedger omits details unless explicit opt-in. |
| SC4 | success_criterion | pass | review | Review found no authority, delegation, or retry-control changes. |
| SC5 | success_criterion | pass | review | Specs state vector retrieval remains advisory-only and out of v1 scope. |
| AC1 | acceptance_criterion | pass | test | loop-ledger.test covers apply, review, harden, verification triage, CI entries and their fields. |
| AC2 | acceptance_criterion | pass | test | UNKNOWN/inconclusive mapping and fail-only retryFailureCount covered by loop-ledger tests. |
| AC3 | acceptance_criterion | pass | test | change.test verifies compact opt-in readback has no details by default. |
| AC4 | acceptance_criterion | pass | test | change.test verifies explicit detail opt-in with bounded limit; projector clamps 1-100. |
| AC5 | acceptance_criterion | pass | test | Pure read projection never mutates state; reviewer confirmed no completion authority. |
| AC6 | acceptance_criterion | pass | test | Projector accepts missing optional legacy fields; no live workflow query added to change readback. |
| AC7 | acceptance_criterion | pass | test | advance-delivery spec explicitly keeps vector retrieval advisory-only. |
| C1 | constraint | respected | static_check | Zod-only types plus pure projector; purity and workflow-boundary tests pass. |
| C2 | constraint | respected | static_check | Details are opt-in; default 20 and hard maximum 100 tested. |
| C3 | constraint | respected | static_check | New include.loopLedger surface leaves legacy include.ledger/_ledger behavior unchanged. |
| C4 | constraint | respected | static_check | No vector integration introduced; spec restricts future retrieval to advisory use. |
| C5 | constraint | respected | static_check | Targeted tests, typecheck, schemas check, and acceptance reviewer all passed. |
| DONT1 | avoidance | respected | review | Readback-only projection adds no autonomous action. |
| DONT2 | avoidance | respected | review | No retry control flow changed; derived retryFailureCount is evidence only. |
| DONT3 | avoidance | respected | review | Full details require explicit opt-in and bounded limit. |
| DONT4 | avoidance | respected | review | No meta-harness or prompt rewrite behavior added. |
| DONT5 | avoidance | respected | review | Subagents only report evidence; no orchestration mutation surface added. |
| OOS1 | out_of_scope | not_applicable | not_applicable | No pgvector database work is included in v1. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No golden workflow evaluation runner added. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No blind evaluator mode implementation added. |
| OOS4 | out_of_scope | not_applicable | not_applicable | No continuous self-modification behavior added. |
| OOS5 | out_of_scope | not_applicable | not_applicable | No autonomy expansion beyond current workflow policies. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-52cde4253623 | SC1, SC2, AC1, AC2, AC5, AC6 | AC1, AC2, AC5, AC6 | C1, C3, C4, C5, DONT1, DONT2, DONT4, DONT5 |  |
| tk-e45e7e3b8209 | SC1, SC3, AC3, AC4, AC6 | AC3, AC4, AC6 | C1, C2, C3, C5, DONT1, DONT3, DONT5 |  |
| tk-42fcb03c8554 | SC4, SC5, AC5, AC7 | AC5, AC7 | C3, C4, C5, DONT1, DONT2, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
| tk-3667e10e06c3 |  | SC1, SC2, SC3, SC4, SC5, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, C5, DONT1, DONT2, DONT3, DONT4, DONT5, OOS1, OOS2, OOS3, OOS4, OOS5 |  |
