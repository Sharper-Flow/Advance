# Contract Traceability

**Change ID:** optimizeStatusWip
**Contract Version:** 1
**Rigor:** standard
**Reviewed:** 2026-06-27T18:59:14.605Z

## Contract Items

| ID | Kind | Status | Evidence Policy | Evidence |
| --- | --- | --- | --- | --- |
| SC1 | success_criterion | pass | review | Grouped status read model added: `recommendation_summary`/`recommendation_groups` expose typed grouped counts/examples before flat truncation; formatted output now has compact `nextActionsSection`. Reviewer verdict READY. |
| SC2 | success_criterion | pass | review | Known producers emit typed `StatusRecommendationItem` via `pushStatusRecommendation`; grouping uses `kind/source/priority` fields, not LLM/string parsing. Regression asserts recency emits structural `stale` kind. |
| SC3 | success_criterion | pass | review | Live high-WIP defect addressed by high-WIP summary fixture: 120 recent changes capped before enrichment, recommendation groups expose 15 typed recommendations with grouped counts/omissions. `pnpm run check` passed. |
| AC1 | acceptance_criterion | pass | test | Synthetic 120-change summary fixture returns bounded recent changes, bounded flat recommendations with `recommendations_omitted`, plus `recommendation_summary`/`recommendation_groups` for mixed `clarify`/`stale` typed recommendations. |
| AC2 | acceptance_criterion | pass | test | `applyStatusView` exposes `recommendation_summary` and `recommendation_groups` in hygiene view; detailed flat recommendations are capped at named `STATUS_DETAILED_RECOMMENDATION_LIMIT` with omitted marker when exceeded. |
| AC3 | acceptance_criterion | pass | test | `changes` view still returns full `changes` object/recent drilldown; grouped recommendation fields are additive and detailed flat recommendations are capped only above the named detailed limit. |
| AC4 | acceptance_criterion | pass | test | `StatusRecommendationKind` includes `next_gate`, `clarify`, `stale`, `release_ready`, `cleanup`, `health`, `blocked_or_stuck`; group-order unit test pins deterministic priority ordering and tie-breaks. |
| AC5 | acceptance_criterion | pass | test | `formatStatusOutput` returns `nextActionsSection` with grouped counts, top examples, omitted counts, and drilldown hints while preserving specs/active/archive/recommendationsList basics. Formatter test passes. |
| AC6 | acceptance_criterion | pass | test | Legacy fields preserved: `recommendations`, summary `recommendations_omitted`, `changes`, `temporal_health_ok`, and hygiene fields remain. Existing status tests pass; additive grouped fields do not remove old fields. |
| AC7 | acceptance_criterion | pass | test | Tests cover summary high-WIP fixture, typed grouping builder, structural recency producer, formatter grouped output, and reviewer-added archived-branch cleanup grouping regression. No direct ADV state-file reads involved. |
| AC8 | acceptance_criterion | pass | test | Verification passed: `bin/oc-test targeted -- src/tools/status.test.ts src/tools/status-recommendations.test.ts src/utils/tool-formatters.test.ts` (83 passed); reviewer reran status/status-recommendations/tool-formatters targeted tests; `pnpm run check` passed. |
| C1 | constraint | respected | static_check | Recommendation grouping is deterministic typed code: structural kinds/priorities/sources plus pure `buildStatusRecommendationGroups`; no LLM-owned correctness. |
| C2 | constraint | respected | static_check | `target_path` handling untouched; status changes occur after active store selection and remain read-only projections. |
| C3 | constraint | respected | static_check | Summary recent-change cap remains before enrichment; existing test still asserts only 10 enriched recent changes out of 120. |
| C4 | constraint | respected | static_check | No change/task/gate/archive/worktree mutation semantics changed. Work only shapes read-path recommendation projections and formatter output. |
| C5 | constraint | respected | static_check | Roadmap/backlog tools untouched; status remains operational current-project state. |
| OOS1 | out_of_scope | not_applicable | not_applicable | Release/archive wedges not addressed; only status recommendation projection changed. |
| OOS2 | out_of_scope | not_applicable | not_applicable | No stale threshold changes; existing recency thresholds preserved. |
| OOS3 | out_of_scope | not_applicable | not_applicable | No bulk close/cancel/archive actions implemented. |
| OOS4 | out_of_scope | not_applicable | not_applicable | `adv_wip_state` and roadmap tools untouched. |

## Task References

| Task | Implements | Verifies | Respects | N/A Reason |
| --- | --- | --- | --- | --- |
| tk-60d391cd4089 | AC1, AC4 | AC1, AC4 | SC2, C1, C3 |  |
| tk-f392b6a95067 | AC4, AC6 | AC4, AC6 | SC1, SC2, C1, C4 |  |
| tk-40a120cedb10 | AC1, AC2, AC3, AC6 | AC1, AC2, AC3, AC6 | SC1, C2, C4, C5 |  |
| tk-b7a812ad48c0 | AC5 | AC5 | SC1, C2, C4 |  |
| tk-46321dd30bff |  | AC7, AC8, SC1, SC2, SC3 | C1, C2, C3, C4, C5 |  |
