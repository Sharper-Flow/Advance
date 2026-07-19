# Contract Traceability

**Change ID:** restoreDesignerFollowUp
**Contract Version:** 1
**Rigor:** strict
**Reviewed:** 2026-07-19T03:35:27.213Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | change-state + delegation asset suites passed; classified frontend route test proves engineer-first dispatch. |
| SC2 | success_criterion | pass | review | Lifecycle tests cover delegated and inline designer-follow-up paths plus failed-follow-up completion guard. |
| SC3 | success_criterion | pass | review | Semantic delegation regression tests passed; direct-designer initial route is rejected. |
| SC4 | success_criterion | pass | review | Spec-delta suites passed; modify delta recorded for existing rq-delDefaults10. |
| AC1 | acceptance_criterion | pass | test | Delegation tests prove metadata.frontend=true selects adv-engineer first. |
| AC2 | acceptance_criterion | pass | test | Matching engineer report and cycle provenance tests passed for designer follow-up. |
| AC3 | acceptance_criterion | pass | test | Risk-forced inline receipt path and designer follow-up tests passed. |
| AC4 | acceptance_criterion | pass | test | Report reducer tests reject missing, stale, and mismatched implementation-cycle provenance. |
| AC5 | acceptance_criterion | pass | test | Reviewer confirmed designer packet remains UI-scoped and broader work is follow-up only. |
| AC6 | acceptance_criterion | pass | test | Designer guidance requires unavailable-preview reason with bounded source/a11y fallback. |
| AC7 | acceptance_criterion | pass | test | Asset and semantic suites passed; reviewer corrected stale SETUP mirror in b0d58aa4. |
| AC8 | acceptance_criterion | pass | test | 61 spec-delta tests validate unknown, duplicate, malformed, and conflicting targets fail atomically. |
| AC9 | acceptance_criterion | pass | test | Durable delta dl-RestoreDel10 modifies delegation-defaults/rq-delDefaults10; archive remains global writer. |
| AC10 | acceptance_criterion | pass | test | Design Root-Cause Record preserves separate add-only cancellation and 669f124a delegation flip chains. |
| C1 | constraint | respected | static_check | Routing predicates use metadata.frontend; review found no authoritative title/path/prose classifier. |
| C2 | constraint | respected | static_check | Designer follow-up consumes bounded receipt provenance and retains UI-only scope. |
| C3 | constraint | respected | static_check | Matching-cycle and stale-report rejection tests passed. |
| C4 | constraint | respected | static_check | Delegation law and command assets retain adv-reviewer as review/harden owner. |
| C5 | constraint | respected | static_check | Execution checkpoints and reviewer commit exist on change/restoreDesignerFollowUp worktree. |
| C6 | constraint | respected | static_check | Registry tests confirm only modify delta operation added; no remove/rename/full CRUD surface. |
| DONT1 | avoidance | respected | review | Semantic lifecycle tests reject initial direct adv-designer route for classified tasks. |
| DONT2 | avoidance | respected | review | Provenance validation tests retain strict typed report and cycle checks. |
| DONT3 | avoidance | respected | review | Classification remains structural metadata.frontend only. |
| DONT4 | avoidance | respected | review | Reviewer confirmed designer scope permits adjacent same-surface alignment only. |
| DONT5 | avoidance | respected | review | Typed modify delta is change-owned; no direct global spec write used. |
| OOS1 | out_of_scope | respected | not_applicable | Review found no model-routing policy or selection changes. |
| OOS2 | out_of_scope | respected | not_applicable | Review found no product-facing UI implementation. |
| OOS3 | out_of_scope | respected | not_applicable | Review/harden ownership remains adv-reviewer. |
| OOS4 | out_of_scope | respected | not_applicable | Review found no non-UI worker lane routing changes. |
| OOS5 | out_of_scope | respected | not_applicable | Tool registry exposes modify only; remove, rename, and full CRUD absent. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-1a77938283ba | SC4, AC8, AC9 | AC8, AC9 | C5, C6, DONT5 |  |
| tk-c58dd4445d55 | SC1, SC2, SC3, AC1, AC2, AC3, AC4, AC5, AC6, AC7 | AC1, AC2, AC3, AC4, AC5, AC6, AC7 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-97453ce00c9c |  | SC1, SC2, SC3, SC4, AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10 | C1, C2, C3, C4, C5, C6, DONT1, DONT2, DONT3, DONT4, DONT5 |  |
