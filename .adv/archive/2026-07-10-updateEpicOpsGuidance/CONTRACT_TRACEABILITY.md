# Contract Traceability

**Change ID:** updateEpicOpsGuidance
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-07-10T21:04:50.509Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Acceptance reviewer READY; `/adv-epic`, `ADV_INSTRUCTIONS.md`, Epic spec/mirror, and drift anchors name all required operational-work examples. |
| SC2 | success_criterion | pass | review | Acceptance reviewer and contract scanner confirm typed `adv_followup_promote`/`ops_followup_links` direction and `blocks` versus release-first handoff wording across canonical surfaces. |
| SC3 | success_criterion | pass | review | Spec/scanner evidence confirms existing release gate remains authority; guidance prohibits Epic-gate deployment execution and preserves advisory order. |
| AC1 | acceptance_criterion | pass | test | `advance-epics-assets.test.ts` GREEN 60/60 anchors `/adv-epic` Phase 1 named operational-work elicitation. |
| AC2 | acceptance_criterion | pass | test | `advance-epics-assets.test.ts` GREEN 60/60 anchors `ADV_INSTRUCTIONS.md` typed follow-up route and free-text prohibition. |
| AC3 | acceptance_criterion | pass | test | `advance-epics-assets.test.ts` GREEN 60/60 anchors MUST `rq-epicOpsPlanning01`, scenarios, and blocking/non-blocking semantics in spec and mirror. |
| AC4 | acceptance_criterion | pass | test | Reversible negative-control RED produced one anchor failure; final `advance-epics-assets.test.ts` GREEN 60/60 confirms non-vacuous drift coverage. |
| C1 | constraint | respected | static_check | Contract scanner found no new data model, validator, relationship enum, or gate-readiness implementation; requirement references existing ops laws. |
| C2 | constraint | respected | static_check | Spec and guidance explicitly make operational need contextual, prohibit metadata inference, and include a no-follow-up scenario. |
| C3 | constraint | respected | static_check | Spec scenarios and guidance retain Epic order as advisory and prohibit independent release/task/promotion blocking. |
| C4 | constraint | respected | static_check | Guidance keeps production execution under existing child ops runbook/approval rules; scanner found no execution-path changes. |
| DONT1 | avoidance | respected | review | Canonical guidance and tests forbid treating generic Epic shells as authoritative ops records. |
| DONT2 | avoidance | respected | review | Canonical guidance and no-ops-needed scenario prohibit universal ops follow-up requirements. |
| DONT3 | avoidance | respected | review | Guidance and scenarios explicitly keep Epic ordering advisory. |
| DONT4 | avoidance | respected | review | Typed linked ops follow-up route is required; free-text/agenda/prose are discovery aids only. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Out of scope by approved agreement; contract scanner confirmed no ops schema, relationship enum, gate-readiness, or execution-authority change. |
| OOS2 | out_of_scope | not_applicable | not_applicable | Out of scope by approved agreement; design explicitly rejects heuristic metadata inference. |
| OOS3 | out_of_scope | not_applicable | not_applicable | Out of scope by approved agreement; canonical guidance explicitly states Epic planning does not execute deployments. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-cf9893829c1c | SC2, SC3, AC3 | AC3 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-4dafc1d36282 | SC1, SC2, SC3, AC1, AC2 |  | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
| tk-0e9072cfdc74 |  | SC1, SC2, SC3, AC1, AC2, AC3, AC4 | C1, C2, C3, C4, DONT1, DONT2, DONT3, DONT4 |  |
